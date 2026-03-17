import { AlignJustify } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import AlignTool from "@/components/tools/AlignTool";

export default function AlignPage() {
  return (
    <ToolLayout
      title="Align PDF"
      icon={<AlignJustify className="h-5 w-5" />}
      description="Нормалізуй розмір, орієнтацію та поворот сторінок."
    >
      <AlignTool />
    </ToolLayout>
  );
}