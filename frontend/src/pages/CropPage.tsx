import { Crop } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import CropTool from "@/components/tools/CropTool";

export default function CropPage() {
  return (
    <ToolLayout
      title="Crop PDF"
      icon={<Crop className="h-5 w-5" />}
      description="Обрізай поля сторінок з точним попереднім переглядом."
    >
      <CropTool />
    </ToolLayout>
  );
}