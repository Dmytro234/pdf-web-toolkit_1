import { Combine } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import MergeTool from "@/components/tools/MergeTool";

export default function MergePage() {
  return (
    <ToolLayout
      title="Merge PDF"
      icon={<Combine className="h-5 w-5" />}
      description="Об’єднай кілька PDF в один документ у потрібному порядку."
    >
      <MergeTool />
    </ToolLayout>
  );
}