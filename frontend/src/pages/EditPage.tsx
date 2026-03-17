import { Edit3 } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import EditTool from "@/components/tools/EditTool";

export default function EditPage() {
  return (
    <ToolLayout
      title="Edit PDF"
      icon={<Edit3 className="h-5 w-5" />}
      description="Змінюй порядок, повертай, дублюй і видаляй сторінки."
    >
      <EditTool />
    </ToolLayout>
  );
}