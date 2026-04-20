import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Loader2, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { loginFn } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await loginFn({ data: { email, password } });
      if (result.success) {
        toast.success("Selamat datang kembali");
        window.location.href = "/"; // Force reload to refresh context
      }
    } catch (error: any) {
      toast.error("Login gagal", { description: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = () => {
    setEmail("admin@wildguard.io");
    setPassword("password1234");
    toast.info("Form terisi dengan akun demo", {
      description: "Silakan klik tombol Masuk Sistem secara manual."
    });
  };

  return (
    <div className="min-h-screen bg-cyber-grid flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8 gap-3">
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center glow-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <div className="text-2xl font-bold text-glow">WildGuard</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              IoT × Computer Vision
            </div>
          </div>
        </div>

        <Card className="p-1 gap-2 flex flex-col backdrop-blur border-border/60">
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Selamat Datang</h2>
              <p className="text-sm text-muted-foreground">Masukkan kredensial Anda untuk masuk ke sistem.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@wildguard.io"
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Button
                  type="submit"
                  className="w-full glow-primary"
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Masuk Sistem
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border/40" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase text-muted-foreground">
                    <span className="bg-background px-2">Development Only</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-primary/20 hover:border-primary/50 text-xs h-9 flex items-center justify-center"
                  onClick={fillDemo}
                >
                  <Key className="h-3 w-3 mr-2 text-primary" />
                  Gunakan Akses Demo (Auto-fill)
                </Button>
              </div>
            </form>
          </div>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground mt-8 uppercase tracking-widest">
          © 2026 WildGuard Systems • Restricted Access
        </p>
      </div>
    </div>
  );
}
