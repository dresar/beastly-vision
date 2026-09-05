"""
MQTT bridge service.
Subscribes to ESP32-CAM topics, runs YOLO inference, and forwards alerts to Telegram.
"""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
import time
from collections import deque
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Optional

import httpx
import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)

CONFIG_DIR = Path("config")
CONFIG_PATH = CONFIG_DIR / "mqtt_config.json"


@dataclass
class MQTTConfig:
    enabled: bool = True
    host: str = "broker.emqx.io"
    port: int = 1883
    username: str = ""
    password: str = ""
    device_id: str = "esp32-cam-2"
    topic_prefix: str = "wildguard"
    telegram_enabled: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    alert_min_confidence: float = 0.5
    alert_threat_only: bool = False
    threat_labels: list[str] = None

    def __post_init__(self):
        if self.threat_labels is None:
            self.threat_labels = ["person", "boar", "tiger", "elephant"]

    @property
    def frame_topic(self) -> str:
        return f"{self.topic_prefix}/{self.device_id}/frame/jpeg"

    @property
    def status_topic(self) -> str:
        return f"{self.topic_prefix}/{self.device_id}/status"

    @property
    def command_topic(self) -> str:
        return f"{self.topic_prefix}/{self.device_id}/cmd"

    @property
    def result_topic(self) -> str:
        return f"{self.topic_prefix}/{self.device_id}/result"


class MQTTBridgeService:
    def __init__(self, yolo_service, loop: asyncio.AbstractEventLoop):
        self.yolo = yolo_service
        self.loop = loop
        self.config = self._load_config()
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.last_error: Optional[str] = None
        self.last_result: Optional[Dict[str, Any]] = None
        self.device_online: bool = False
        self.device_last_seen_ts: Optional[float] = None
        self.device_last_payload: Optional[str] = None
        # Heartbeat ESP32 dikirim tiap ~1 detik, tapi jaringan publik bisa jitter.
        # Gunakan timeout lebih longgar agar status tidak mudah flip online/offline.
        self.offline_timeout_s: float = 10.0
        self.recent_events = deque(maxlen=60)
        self._monitor_task: Optional[asyncio.Task] = None

    def _load_config(self) -> MQTTConfig:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        if not CONFIG_PATH.exists():
            cfg = MQTTConfig()
            self._save_config(cfg)
            return cfg

        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return MQTTConfig(**data)

    def _save_config(self, cfg: MQTTConfig):
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(asdict(cfg), indent=2), encoding="utf-8")

    def get_config_safe(self) -> Dict[str, Any]:
        data = asdict(self.config)
        if data.get("telegram_bot_token"):
            data["telegram_bot_token"] = "***hidden***"
        if data.get("password"):
            data["password"] = "***hidden***"
        return data

    async def update_config(self, patch: Dict[str, Any]):
        data = asdict(self.config)
        data.update(patch)
        new_cfg = MQTTConfig(**data)
        self.config = new_cfg
        self._save_config(new_cfg)

        # Reconnect to apply broker/topic changes.
        await self.restart()

    async def start(self):
        if not self.config.enabled:
            logger.info("MQTT disabled in config")
            return
        await self._connect_client()
        if self._monitor_task is None or self._monitor_task.done():
            self._monitor_task = self.loop.create_task(self._offline_monitor_loop())

    async def stop(self):
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None
        if self.client is None:
            return
        self.client.loop_stop()
        self.client.disconnect()
        self.connected = False
        self._set_device_online(False, "service_stop", "MQTT bridge stopped")
        logger.info("MQTT bridge stopped")

    async def restart(self):
        await self.stop()
        if self.config.enabled:
            await self.start()

    async def _connect_client(self):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"wildguard-ai-{self.config.device_id}")
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        if self.config.username:
            self.client.username_pw_set(self.config.username, self.config.password)

        try:
            self.client.connect(self.config.host, self.config.port, keepalive=30)
            self.client.loop_start()
            logger.info("Connecting MQTT %s:%s ...", self.config.host, self.config.port)
        except Exception as exc:
            self.last_error = f"MQTT connect failed: {exc}"
            logger.exception(self.last_error)

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            self.connected = True
            self.last_error = None
            client.subscribe(self.config.frame_topic, qos=0)
            client.subscribe(self.config.status_topic, qos=0)
            logger.info("MQTT connected. Subscribed to %s and %s", self.config.frame_topic, self.config.status_topic)
            self._push_event("info", "mqtt_connected", f"Subscribed frame={self.config.frame_topic} status={self.config.status_topic}")
        else:
            self.connected = False
            self.last_error = f"MQTT refused connection: {reason_code}"
            logger.error(self.last_error)
            self._push_event("error", "mqtt_refused", self.last_error)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        self.connected = False
        logger.warning("MQTT disconnected: reason=%s", reason_code)
        self._push_event("warn", "mqtt_disconnected", f"reason={reason_code}")

    def _on_message(self, client, userdata, msg):
        try:
            if msg.topic == self.config.frame_topic:
                self._mark_device_seen("frame")
                asyncio.run_coroutine_threadsafe(self._process_frame(msg.payload), self.loop)
            elif msg.topic == self.config.status_topic:
                payload = msg.payload.decode("utf-8", errors="ignore")
                self.device_last_payload = payload
                self._mark_device_seen("status")
                logger.info("MQTT status from ESP32: %s", payload)
                self._push_event("info", "device_status", payload)
        except Exception as exc:
            logger.exception("MQTT message handler failed: %s", exc)

    async def _process_frame(self, frame_bytes: bytes):
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp.write(frame_bytes)
                temp_path = tmp.name

            result = await self.yolo.predict(image_path=temp_path, confidence=0.25, iou=0.45)
            self.last_result = result
            if self.client:
                self.client.publish(self.config.result_topic, json.dumps(result), qos=0, retain=False)

            await self._maybe_send_telegram(result)
        except Exception as exc:
            self.last_error = f"Frame process failed: {exc}"
            logger.exception(self.last_error)
            self._push_event("error", "frame_process_failed", str(exc))
        finally:
            if temp_path:
                try:
                    Path(temp_path).unlink(missing_ok=True)
                except Exception:
                    pass

    async def _maybe_send_telegram(self, result: Dict[str, Any]):
        if not self.config.telegram_enabled:
            return
        if not self.config.telegram_bot_token or not self.config.telegram_chat_id:
            return

        max_conf = float(result.get("max_confidence") or 0)
        label = str(result.get("primary_label") or "unknown")

        if max_conf < self.config.alert_min_confidence:
            return

        if self.config.alert_threat_only and label not in self.config.threat_labels:
            return

        text = (
            f"WildGuard Alert\n"
            f"Label: {label}\n"
            f"Confidence: {round(max_conf * 100, 1)}%\n"
            f"Count: {result.get('count', 0)}"
        )
        await self.send_telegram_message(text)

    async def send_telegram_message(self, text: str):
        token = self.config.telegram_bot_token
        chat_id = self.config.telegram_chat_id
        if not token or not chat_id:
            raise ValueError("Telegram token/chat_id belum diatur")

        url = f"https://api.telegram.org/bot{token}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={"chat_id": chat_id, "text": text})
            resp.raise_for_status()

    def _push_event(self, level: str, event: str, detail: str):
        self.recent_events.append({
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime()),
            "level": level,
            "event": event,
            "detail": detail,
        })

    def _mark_device_seen(self, source: str):
        self.device_last_seen_ts = time.monotonic()
        if not self.device_online:
            self._set_device_online(True, "device_online", f"Received MQTT data from {source}")

    def _set_device_online(self, online: bool, event: str, detail: str):
        if self.device_online == online:
            return
        self.device_online = online
        level = "info" if online else "warn"
        self._push_event(level, event, detail)

    async def _offline_monitor_loop(self):
        while True:
            await asyncio.sleep(1)
            if self.device_last_seen_ts is None:
                continue
            elapsed = time.monotonic() - self.device_last_seen_ts
            if self.device_online and elapsed > self.offline_timeout_s:
                self._set_device_online(False, "device_offline", f"No MQTT data for {round(elapsed, 1)}s")

    def get_status(self) -> Dict[str, Any]:
        last_seen_age_s = None
        if self.device_last_seen_ts is not None:
            last_seen_age_s = round(time.monotonic() - self.device_last_seen_ts, 2)
        return {
            "enabled": self.config.enabled,
            "connected": self.connected,
            "host": self.config.host,
            "port": self.config.port,
            "frame_topic": self.config.frame_topic,
            "status_topic": self.config.status_topic,
            "result_topic": self.config.result_topic,
            "last_error": self.last_error,
            "last_result": self.last_result,
            "device_online": self.device_online,
            "device_last_seen_age_s": last_seen_age_s,
            "device_last_payload": self.device_last_payload,
            "recent_events": list(self.recent_events)[-20:],
        }
