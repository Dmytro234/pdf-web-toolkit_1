import { Trash2 } from "lucide-react";

import ToolLayout from "@/components/layout/ToolLayout";
import DeletePagesTool from "@/components/tools/DeletePagesTool";

export default function DeletePagesPage() {
  return (
    <ToolLayout
      title="Delete Pages"
      icon={<Trash2 className="h-5 w-5" />}
      description="Видаляй непотрібні сторінки з документа перед збереженням."
    >
      <DeletePagesTool />
    </ToolLayout>
  );
}