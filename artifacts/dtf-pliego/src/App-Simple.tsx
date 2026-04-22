// VERSIÓN SIMPLIFICADA DE App.tsx PARA VER SOLO EL POS EN BOLT.DIY
// Copia este contenido y pégalo en artifacts/dtf-pliego/src/App.tsx

import POS from "@/pages/POS/index";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  return (
    <TooltipProvider>
      <POS />
      <Toaster />
    </TooltipProvider>
  );
}

// Eso es todo! Ahora el POS se mostrará directamente sin login
// Para volver a la versión normal, restaura el App.tsx original desde git
