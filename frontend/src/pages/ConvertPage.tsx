import { FileSymlink } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import ConvertTool from "@/components/tools/ConvertTool";

export default function ConvertPage() {
  return (
    <ToolLayout
      title="Convert"
      icon={<FileSymlink className="h-5 w-5" />}
      description="Конвертуй PDF, зображення та DOCX у підтримувані формати."
    >
      <ConvertTool />
    </ToolLayout>
  );
}