import { FileOutput } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import ExtractTool from "@/components/tools/ExtractTool";

export default function ExtractPage() {
  return (
    <ToolLayout
      title="Extract Pages"
      icon={<FileOutput className="h-5 w-5" />}
      description="Витягни обрані сторінки в окремий PDF документ."
    >
      <ExtractTool />
    </ToolLayout>
  );
}