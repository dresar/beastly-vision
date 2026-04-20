import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Cpu, Database, Play, Rocket, ShieldCheck, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { getDatasetsFn, getModelsFn, triggerTrainingFn, prepareDatasetFn } from "@/lib/ml-api";
import { DetectionCheck } from "@/components/ml/detection-check";

export const Route = createFileRoute("/ml")({
  component: () => (
    <DashboardLayout>
      <MLManagement />
    </DashboardLayout>
  ),
});

interface Dataset {
  id: string;
  name: string;
  description: string;
  image_count: number;
  status: "ready" | "training" | "error";
  created_at: string;
}

interface Model {
  id: string;
  version: string;
  accuracy: number;
  status: "ready" | "training" | "error";
  created_at: string;
}

function MLManagement() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [training, setTraining] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [ds, md] = await Promise.all([getDatasetsFn(), getModelsFn()]);
      setDatasets(ds as Dataset[]);
      setModels(md as Model[]);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handlePrepare = async (ds: Dataset) => {
    setPreparing(ds.id);
    try {
      await prepareDatasetFn({ data: { datasetName: ds.name } });
      toast.success("Dataset Berhasil Disiapkan", {
        description: "Struktur folder dan dataset.yaml telah dibuat di folder ml/datasets/."
      });
    } catch (error: any) {
      toast.error("Gagal menyiapkan dataset", { description: error.message });
    } finally {
      setPreparing(null);
    }
  };

  const handleTrain = async (ds: Dataset) => {
    setTraining(ds.id);
    try {
      const res = await triggerTrainingFn({ 
        data: { datasetId: ds.id, datasetName: ds.name, epochs: 10 } 
      });
      if (res.success) {
        toast.success("Training Berhasil Dimulai", {
          description: "Proses berjalan di background. Cek status di tabel model."
        });
      }
    } catch (error: any) {
      toast.error("Gagal memulai training", { description: error.message });
    } finally {
      setTraining(null);
    }
  };

  return (
    <>
      <PageHeader
        title="ML Operations"
        description="Latih model YOLOv8 custom untuk akurasi deteksi satwa liar yang lebih tinggi."
      />

      <div className="mb-8">
        <DetectionCheck />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" /> Dataset Terdaftar
            </h2>
            <Button size="sm" variant="outline">Import Dataset</Button>
          </div>
          <div className="space-y-4">
            {datasets.map(ds => (
              <div key={ds.id} className="p-4 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-medium">{ds.name}</h3>
                    <p className="text-xs text-muted-foreground">{ds.description}</p>
                  </div>
                  <Badge variant={ds.status === 'training' ? 'secondary' : 'outline'}>
                    {ds.status === 'training' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {ds.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs mt-4 gap-2">
                  <span className="text-muted-foreground">{ds.image_count} GambarTerlabel</span>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-8" 
                      disabled={ds.status === 'training' || preparing === ds.id}
                      onClick={() => handlePrepare(ds)}
                    >
                      {preparing === ds.id ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Database className="h-3 w-3 mr-2" />}
                      Siapkan Dataset
                    </Button>
                    <Button 
                      size="sm" 
                      className="h-8" 
                      disabled={ds.status === 'training' || training === ds.id}
                      onClick={() => handleTrain(ds)}
                    >
                      {training === ds.id ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Play className="h-3 w-3 mr-2" />}
                      Latih Model
                    </Button>
                  </div>
                </div>
                {ds.status === 'training' && (
                  <Progress value={45} className="h-1 mt-3" />
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" /> Trained Models
            </h2>
          </div>
          <div className="space-y-3">
            {models.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Belum ada model yang dilatih.</p>}
            {models.map(m => (
              <div key={m.id} className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/20">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <Rocket className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Model {m.version}</div>
                    <div className="text-[10px] text-muted-foreground">mAP50: {(Number(m.accuracy) * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={m.status === 'ready' ? 'default' : 'secondary'}>
                        {m.status}
                    </Badge>
                    {m.status === 'ready' && <Button size="icon" variant="ghost" className="h-8 w-8 text-success"><ShieldCheck className="h-4 w-4" /></Button>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-8 bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
        <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="h-24 w-24 rounded-2xl bg-primary/20 flex items-center justify-center glow-primary">
                <Cpu className="h-12 w-12 text-primary" />
            </div>
            <div className="flex-1 text-center md:text-left">
                <h2 className="text-xl font-bold mb-2">Automated Reinforcement Learning</h2>
                <p className="text-sm text-muted-foreground">
                    Sistem dapat mendeteksi "Low Confidence Targets" dan secara otomatis menambahkannya ke dataset 
                    untuk proses retraining berkala guna meningkatkan akurasi sistem di lapangan secara mandiri.
                </p>
            </div>
            <Button size="lg" className="glow-primary">Aktifkan Auto-Train</Button>
        </div>
      </Card>
    </>
  );
}
