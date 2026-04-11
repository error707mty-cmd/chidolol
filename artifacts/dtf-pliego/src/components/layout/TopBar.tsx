import { useUpdatePliego, getGetPliegoQueryKey, getGetPliegoPriceQueryKey, Pliego, useAutoNestPliego, getListPliegoImagesQueryKey, getGetPliegoStatsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LayoutGrid, Download, FolderOpen, Loader2, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

function UserAvatar({ url, name }: { url?: string; name?: string }) {
  const initials = (name ?? "U").slice(0, 2).toUpperCase();
  if (url) return <img src={url} alt={name} className="tb-avatar-img" />;
  return <span className="tb-avatar-placeholder">{initials}</span>;
}

export function Topbar({ pliego }: { pliego: Pliego }) {
  const queryClient = useQueryClient();
  const updatePliego = useUpdatePliego();
  const autoNest = useAutoNestPliego();
  const { user, logout } = useAuth() as any;

  const handleNameChange = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value !== pliego.name) {
      updatePliego.mutate(
        { id: pliego.id, data: { name: e.target.value } },
        { onSuccess: (updated) => queryClient.setQueryData(getGetPliegoQueryKey(pliego.id), updated) }
      );
    }
  };

  const handleDpiChange = (val: string) => {
    const dpi = parseInt(val, 10);
    if (dpi !== pliego.dpi) {
      updatePliego.mutate(
        { id: pliego.id, data: { dpi } },
        { onSuccess: (updated) => queryClient.setQueryData(getGetPliegoQueryKey(pliego.id), updated) }
      );
    }
  };

  const handleAutoNest = () => {
    autoNest.mutate({ id: pliego.id }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListPliegoImagesQueryKey(pliego.id) });
        queryClient.invalidateQueries({ queryKey: getGetPliegoStatsQueryKey(pliego.id) });
        queryClient.invalidateQueries({ queryKey: getGetPliegoPriceQueryKey(pliego.id) });
        queryClient.invalidateQueries({ queryKey: getGetPliegoQueryKey(pliego.id) });
        const heightStr = result.newHeightCm !== undefined ? ` · alto: ${result.newHeightCm.toFixed(1)} cm` : "";
        toast.success(`${result.placedCount} imágenes acomodadas${heightStr}`);
      },
      onError: () => toast.error("Error al auto-acomodar"),
    });
  };

  return (
    <header className="tb-root">
      {/* Rainbow bar at bottom */}
      <div className="tb-rainbow" />

      <div className="tb-brand">
        <img src="/logo-error707.png" alt="ERROR707 Estudio" className="tb-logo-img" />
      </div>

      <div className="tb-sep" />

      <Link href="/pliegos">
        <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-white/60 hover:text-white hover:bg-white/10">
          <FolderOpen className="h-3.5 w-3.5" />
          Mis trabajos
        </Button>
      </Link>

      {user?.isAdmin && (
        <>
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-violet-400/80 hover:text-violet-300 hover:bg-violet-500/10">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor">
                <path d="M7 1L1.5 3.5v4C1.5 10.5 4 12.5 7 13c3-.5 5.5-2.5 5.5-5.5v-4L7 1z"/>
              </svg>
              Admin
            </Button>
          </Link>
          
          <Link href="/admin/pos">
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs text-green-400/80 hover:text-green-300 hover:bg-green-500/10">
              <ShoppingCart className="h-3.5 w-3.5" />
              POS
            </Button>
          </Link>
        </>
      )}

      <Link href="/perfil">
        <button
          title={`Perfil de ${user?.username}`}
          className="tb-profile-btn"
        >
          <UserAvatar url={user?.avatarUrl} name={user?.displayName ?? user?.username} />
        </button>
      </Link>

      <div className="tb-sep" />

      <Input
        defaultValue={pliego.name}
        onBlur={handleNameChange}
        className="w-44 h-7 text-sm text-white bg-transparent border-transparent hover:border-white/20 focus-visible:bg-white/5 transition-all placeholder:text-white/30"
      />

      <div className="flex items-center gap-1.5 text-xs text-white/60 ml-auto">
        <span>DPI</span>
        <Select defaultValue={pliego.dpi.toString()} onValueChange={handleDpiChange}>
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="150">150</SelectItem>
            <SelectItem value="300">300</SelectItem>
            <SelectItem value="600">600</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        size="sm"
        variant="secondary"
        className="h-7 text-xs gap-1.5"
        onClick={handleAutoNest}
        disabled={autoNest.isPending}
      >
        {autoNest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutGrid className="h-3.5 w-3.5" />}
        Auto-acomodar
      </Button>

      <Link href={`/export/${pliego.id}`}>
        <Button size="sm" className="h-7 text-xs gap-1.5 tb-export-btn">
          <Download className="h-3.5 w-3.5" />
          Exportar
        </Button>
      </Link>

    </header>
  );
}
