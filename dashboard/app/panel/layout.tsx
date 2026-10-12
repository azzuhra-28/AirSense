
import { SensorProvider } from "@/components/SensorProvider";
import { Sidebar } from "@/components/Sidebar";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SensorProvider>
      <div className="flex min-h-screen bg-[#F5F5F4]">
        <Sidebar />

        <main className="min-w-0 flex-1 lg:pl-60">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </SensorProvider>
  );
}
