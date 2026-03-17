import { Scissors } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import SplitTool from "@/components/tools/SplitTool";

export default function SplitPage() {
  return (
    <ToolLayout
      title="Split PDF"
      icon={<Scissors className="h-5 w-5" />}
      description="Розділяй PDF за сторінками, розміром або власними діапазонами."
    >
      <SplitTool />
    </ToolLayout>
  );
}