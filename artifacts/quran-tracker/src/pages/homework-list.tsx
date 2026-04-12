import { useListHomework, useCreateHomework, useDeleteHomework, getListHomeworkQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronRight } from "lucide-react";

export default function HomeworkList() {
  const { data: sessions, isLoading } = useListHomework();
  const createHomework = useCreateHomework();
  const deleteHomework = useDeleteHomework();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [memorizeRange, setMemorizeRange] = useState("");
  const [reviseRange, setReviseRange] = useState("");

  const parseRange = (rangeStr: string): number[] => {
    if (!rangeStr.trim()) return [];
    const pages: number[] = [];
    const parts = rangeStr.split(",").map(p => p.trim());
    for (const part of parts) {
      if (part.includes("-")) {
        const [s, e] = part.split("-").map(n => parseInt(n.trim(), 10));
        if (!isNaN(s) && !isNaN(e)) {
          for (let i = s; i <= e; i++) pages.push(i);
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n)) pages.push(n);
      }
    }
    return pages;
  };

  const handleCreate = () => {
    if (!title || !dueDate) {
      toast({ title: "Title and due date are required", variant: "destructive" });
      return;
    }

    createHomework.mutate(
      {
        data: {
          title,
          dueDate: new Date(dueDate).toISOString(),
          memorizePages: parseRange(memorizeRange),
          revisePages: parseRange(reviseRange),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Homework session created" });
          setDialogOpen(false);
          setTitle("");
          setDueDate("");
          setMemorizeRange("");
          setReviseRange("");
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteHomework.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Homework deleted" });
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
        },
      }
    );
  };

  const statusColors: Record<string, string> = {
    active: "bg-sky-100 text-sky-800 border-sky-200",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    overdue: "bg-rose-100 text-rose-800 border-rose-200",
  };

  return (
    <div className="space-y-4" data-testid="homework-list-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Homework</h2>
          <p className="text-sm text-muted-foreground mt-1">Track your bi-weekly assignments</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="btn-create-homework">
              <Plus className="w-4 h-4 mr-1" /> New Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Homework Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Week 12 Assignment" data-testid="input-hw-title" />
              </div>
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} data-testid="input-hw-due" />
              </div>
              <div>
                <Label>Pages to Memorize</Label>
                <Input value={memorizeRange} onChange={e => setMemorizeRange(e.target.value)} placeholder="e.g. 100-105, 110" data-testid="input-hw-memorize" />
                <p className="text-xs text-muted-foreground mt-1">Use ranges (100-105) or comma-separated (100, 101, 105)</p>
              </div>
              <div>
                <Label>Pages to Revise</Label>
                <Input value={reviseRange} onChange={e => setReviseRange(e.target.value)} placeholder="e.g. 1-20" data-testid="input-hw-revise" />
              </div>
              <Button onClick={handleCreate} disabled={createHomework.isPending} className="w-full" data-testid="btn-submit-homework">
                {createHomework.isPending ? "Creating..." : "Create Session"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map(session => {
            const pct = session.totalItems > 0 ? Math.round((session.completedItems / session.totalItems) * 100) : 0;
            return (
              <Card key={session.id} className="border shadow-sm" data-testid={`homework-card-${session.id}`}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/homework/${session.id}`} className="font-medium text-sm hover:underline cursor-pointer">
                        {session.title}
                      </Link>
                      <Badge variant="outline" className={statusColors[session.status] || ""}>
                        {session.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Due: {new Date(session.dueDate).toLocaleDateString()}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(session.id)} data-testid={`btn-delete-hw-${session.id}`}>
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </Button>
                      <Link href={`/homework/${session.id}`}>
                        <Button variant="ghost" size="sm">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={pct} className="flex-1 h-2" />
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {session.completedItems}/{session.totalItems}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No homework sessions yet. Create one to start tracking your assignments.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
