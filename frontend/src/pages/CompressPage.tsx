import { Minimize2 } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import CompressTool from "@/components/tools/CompressTool";

export default function CompressPage() {
  return (
    <ToolLayout
      title="Compress PDF"
      icon={<Minimize2 className="h-5 w-5" />}
      description="Зменшуй розмір PDF з вибором рівня стискання."
    >
      <CompressTool />
    </ToolLayout>
  );
}