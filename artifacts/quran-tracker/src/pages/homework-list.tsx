import { useListHomework, useCreateHomework, useDeleteHomework, getListHomeworkQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { SURAHS, ALL_ROB3S, ROB3S_PER_JUZ, JUZ_RANGES } from "@/lib/quran-ref";
import { getDefaultPageName } from "@/lib/page-names";

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

  const appendRange = (current: string, startPage: number, endPage: number): string => {
    const fragment = startPage === endPage ? `${startPage}` : `${startPage}-${endPage}`;
    const trimmed = current.trim();
    if (!trimmed) return fragment;
    return `${trimmed.replace(/,\s*$/, "")}, ${fragment}`;
  };

  const parseRange = (rangeStr: string): number[] => {
    if (!rangeStr.trim()) return [];
    const seen = new Set<number>();
    const parts = rangeStr.split(",").map(p => p.trim());
    for (const part of parts) {
      if (part.includes("-")) {
        const [s, e] = part.split("-").map(n => parseInt(n.trim(), 10));
        if (!isNaN(s) && !isNaN(e)) {
          const lo = Math.min(s, e);
          const hi = Math.max(s, e);
          for (let i = lo; i <= hi; i++) seen.add(i);
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n)) seen.add(n);
      }
    }
    return Array.from(seen).sort((a, b) => a - b);
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
                <RangePickers
                  testIdPrefix="memorize"
                  onPick={(start, end) => setMemorizeRange(appendRange(memorizeRange, start, end))}
                />
                <p className="text-xs text-muted-foreground mt-1">Type ranges (100-105 or 100, 101, 105) or pick a Surah / Part above to append.</p>
              </div>
              <div>
                <Label>Pages to Revise</Label>
                <Input value={reviseRange} onChange={e => setReviseRange(e.target.value)} placeholder="e.g. 1-20" data-testid="input-hw-revise" />
                <RangePickers
                  testIdPrefix="revise"
                  onPick={(start, end) => setReviseRange(appendRange(reviseRange, start, end))}
                />
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

interface RangePickersProps {
  testIdPrefix: string;
  onPick: (startPage: number, endPage: number) => void;
}

function RangePickers({ testIdPrefix, onPick }: RangePickersProps) {
  const [surahKey, setSurahKey] = useState(0);
  const [partKey, setPartKey] = useState(0);

  const handleSurah = (value: string) => {
    const n = parseInt(value, 10);
    const s = SURAHS.find(x => x.number === n);
    if (s) onPick(s.startPage, s.endPage);
    setSurahKey(k => k + 1);
  };

  const handlePart = (value: string) => {
    const n = parseInt(value, 10);
    const r = ALL_ROB3S.find(x => x.rob3 === n);
    if (r) onPick(r.startPage, r.endPage);
    setPartKey(k => k + 1);
  };

  return (
    <div className="grid grid-cols-2 gap-2 mt-2" data-testid={`range-pickers-${testIdPrefix}`}>
      <Select key={`surah-${surahKey}`} onValueChange={handleSurah}>
        <SelectTrigger data-testid={`select-surah-${testIdPrefix}`}>
          <SelectValue placeholder="Add Surah…" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {SURAHS.map(s => {
            const range = s.startPage === s.endPage ? `p. ${s.startPage}` : `p. ${s.startPage}–${s.endPage}`;
            return (
              <SelectItem
                key={s.number}
                value={String(s.number)}
                data-testid={`opt-surah-${testIdPrefix}-${s.number}`}
              >
                <div className="flex flex-col items-start gap-0 py-0.5">
                  <span className="text-sm">
                    {s.number}. {s.name}
                    <span className="ml-2 text-muted-foreground" dir="rtl">{s.arabic}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{range}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <Select key={`part-${partKey}`} onValueChange={handlePart}>
        <SelectTrigger data-testid={`select-part-${testIdPrefix}`}>
          <SelectValue placeholder="Add Part…" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {JUZ_RANGES.map(juz => (
            <SelectGroup key={juz.juz}>
              <SelectLabel>Juz {juz.juz}</SelectLabel>
              {ALL_ROB3S.filter(r => r.juz === juz.juz).map(r => {
                const range = r.startPage === r.endPage ? `p. ${r.startPage}` : `p. ${r.startPage}–${r.endPage}`;
                const ayah = getDefaultPageName(r.startPage);
                return (
                  <SelectItem
                    key={r.rob3}
                    value={String(r.rob3)}
                    data-testid={`opt-part-${testIdPrefix}-${r.rob3}`}
                  >
                    <div className="flex flex-col items-start gap-0 py-0.5 max-w-[260px]">
                      <span className="text-sm">
                        Part {r.rob3InJuz + 1}/{ROB3S_PER_JUZ}
                        <span className="ml-2 text-muted-foreground">· {range}</span>
                      </span>
                      {ayah ? (
                        <span className="text-[11px] text-muted-foreground truncate w-full" dir="rtl">
                          {ayah}
                        </span>
                      ) : null}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
