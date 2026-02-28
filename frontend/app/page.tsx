// app/page.tsx
import Link from "next/link";
import { ArrowRight, Activity } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50 p-10 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-16">
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-white">
            Robotics Motion Planning
          </h1>
          <p className="text-neutral-400 text-lg">
            Interactive visualizations for kinematics and trajectory generation.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card for 3-DoF LSPB */}
          <Link
            href="/viz/lspb-manipulator"
            className="group block p-6 bg-neutral-900 border border-neutral-800 rounded-xl hover:border-blue-500 hover:bg-neutral-800/50 transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
                <Activity size={24} />
              </div>
              <ArrowRight
                className="text-neutral-500 group-hover:text-blue-400 transition-colors"
                size={20}
              />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-white">
              3-DoF Planar Manipulator
            </h2>
            <p className="text-neutral-400 text-sm">
              Trajectory generation using Linear Segments with Parabolic Blends
              (LSPB) and Jacobian-based Inverse Kinematics.
            </p>
          </Link>

          {/* Placeholder for future viz */}
          <div className="p-6 bg-neutral-900/50 border border-neutral-800/50 rounded-xl border-dashed flex flex-col items-center justify-center text-neutral-600 min-h-[200px]">
            <span className="text-sm font-medium">Future Visualization</span>
          </div>
        </div>
      </div>
    </main>
  );
}
