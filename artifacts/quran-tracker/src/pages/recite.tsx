import { useRecordBatchRecitation, getListPageProgressQueryKey, getGetProgressOverviewQueryKey, getListJuzProgressQueryKey, getListSurahProgressQueryKey, getGetRecentActivityQueryKey } from "@workspace/api-client-react";
import type { BatchRecitationBodyQuality } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle } from "lucide-react";

export default function Recite() {
  const [pageStart, setPageStart] = useState("");
  const [pageEnd, setPageEnd] = useState("");
  const [quality, setQuality] = useState<BatchRecitationBodyQuality>("good");
  const [mistakes, setMistakes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const recordBatch = useRecordBatchRecitation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = () => {
    const start = parseInt(pageStart, 10);
    const end = pageEnd ? parseInt(pageEnd, 10) : start;

    if (isNaN(start) || start < 1 || start > 604) {
      toast({ title: "Please enter a valid start page (1-604)", variant: "destructive" });
      return;
    }
    if (end < start || end > 604) {
      toast({ title: "Please enter a valid end page", variant: "destructive" });
      return;
    }

    const pageNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);

    recordBatch.mutate(
      {
        data: {
          pageNumbers,
          quality,
          mistakes: mistakes ? parseInt(mistakes, 10) : undefined,
        },
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          toast({ title: `Recorded ${pageNumbers.length} page(s) as ${quality}` });
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
          setTimeout(() => setSubmitted(false), 3000);
        },
      }
    );
  };

  const qualityOptions = [
    { value: "excellent", label: "Excellent", desc: "Perfect or near-perfect", color: "border-emerald-300 bg-emerald-50 data-[state=checked]:bg-emerald-100 data-[state=checked]:border-emerald-500" },
    { value: "good", label: "Good", desc: "2 or fewer mistakes per page", color: "border-sky-300 bg-sky-50 data-[state=checked]:bg-sky-100 data-[state=checked]:border-sky-500" },
    { value: "hard", label: "Hard", desc: "Up to 3 mistakes per page avg", color: "border-amber-300 bg-amber-50 data-[state=checked]:bg-amber-100 data-[state=checked]:border-amber-500" },
    { value: "relearn", label: "Relearn", desc: "Needs significant work", color: "border-rose-300 bg-rose-50 data-[state=checked]:bg-rose-100 data-[state=checked]:border-rose-500" },
  ];

  return (
    <div className="space-y-6 max-w-2xl" data-testid="recite-page">
      <div>
        <h2 className="text-2xl font-semibold">Record Recitation</h2>
        <p className="text-sm text-muted-foreground mt-1">Log your revision or memorization session</p>
      </div>

      {submitted && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl" data-testid="success-message">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Recitation recorded successfully</span>
        </div>
      )}

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Page Range</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pageStart">Start Page</Label>
              <Input
                id="pageStart"
                type="number"
                min={1}
                max={604}
                placeholder="e.g. 1"
                value={pageStart}
                onChange={e => setPageStart(e.target.value)}
                data-testid="input-page-start"
              />
            </div>
            <div>
              <Label htmlFor="pageEnd">End Page (optional)</Label>
              <Input
                id="pageEnd"
                type="number"
                min={1}
                max={604}
                placeholder="Same as start"
                value={pageEnd}
                onChange={e => setPageEnd(e.target.value)}
                data-testid="input-page-end"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Quality Rating</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup value={quality} onValueChange={(v) => setQuality(v as BatchRecitationBodyQuality)} className="grid grid-cols-2 gap-3">
            {qualityOptions.map(opt => (
              <Label
                key={opt.value}
                htmlFor={`quality-${opt.value}`}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${opt.color}`}
                data-testid={`quality-option-${opt.value}`}
              >
                <RadioGroupItem value={opt.value} id={`quality-${opt.value}`} />
                <div>
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.desc}</div>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Mistakes (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            min={0}
            placeholder="Number of mistakes"
            value={mistakes}
            onChange={e => setMistakes(e.target.value)}
            data-testid="input-mistakes"
          />
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={!pageStart || recordBatch.isPending}
        className="w-full"
        size="lg"
        data-testid="btn-record-recitation"
      >
        {recordBatch.isPending ? "Recording..." : "Record Recitation"}
      </Button>
    </div>
  );
}
