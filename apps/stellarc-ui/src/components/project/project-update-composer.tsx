import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import useCreateProjectUpdate from "@/hooks/mutations/project/use-create-project-update";
import type { ProjectHealth } from "./project-health-badge";
export default function ProjectUpdateComposer({
  projectId,
}: {
  projectId: string;
}) {
  const [content, setContent] = useState("");
  const [health, setHealth] = useState<ProjectHealth>("on-track");
  const mutation = useCreateProjectUpdate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    await mutation.mutateAsync({
      id: projectId,
      content: content.trim(),
      health,
    });
    setContent("");
  };
  return (
    <form
      onSubmit={submit}
      className="space-y-3"
      data-testid="project-update-composer"
    >
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Share an update"
        required
      />
      <Select
        value={health}
        onValueChange={(v) => setHealth(v as ProjectHealth)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="on-track">On track</SelectItem>
          <SelectItem value="at-risk">At risk</SelectItem>
          <SelectItem value="off-track">Off track</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" disabled={mutation.isPending || !content.trim()}>
        Post update
      </Button>
    </form>
  );
}
