import { NextResponse } from "next/server";

type LiveIssueInput = {
  id: string;
  status: string;
  assignedDepartmentId?: string;
};

function heuristicSummary(issues: LiveIssueInput[]): string {
  if (!issues.length) {
    return "No issues are currently open. Operations are stable across departments.";
  }

  const open = issues.filter(
    (issue) => issue.status !== "Resolved" && issue.status !== "Rejected",
  );

  const byDepartment = new Map<string, number>();
  for (const issue of open) {
    const dept = issue.assignedDepartmentId || "unassigned_department";
    byDepartment.set(dept, (byDepartment.get(dept) ?? 0) + 1);
  }

  const topDept = Array.from(byDepartment.entries()).sort((a, b) => b[1] - a[1])[0];

  if (open.length <= 2) {
    return topDept
      ? `Everything looks good. Only a few issues are left, mostly in ${topDept[0]}. Continue focused follow-up and close today.`
      : "Everything looks good. Only a few issues remain and should be closed soon.";
  }

  if (open.length <= 6) {
    return topDept
      ? `Operations are mostly under control. Keep pressure on ${topDept[0]}, which has the highest remaining load.`
      : "Operations are mostly under control. Keep tracking pending cases and SLA-sensitive issues.";
  }

  return topDept
    ? `Issue load is elevated. Prioritize rapid triage and assignment in ${topDept[0]}, and monitor SLA breach risk closely.`
    : "Issue load is elevated. Prioritize triage, reassignment, and SLA-sensitive cases.";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      signature?: string;
      issues?: LiveIssueInput[];
    };

    const issues = Array.isArray(body.issues) ? body.issues : [];
    const signature = String(body.signature ?? "");

    if (!issues.length) {
      return NextResponse.json({
        signature,
        summary:
          "No active issues detected. Dashboard indicators look stable right now.",
        source: "heuristic",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        signature,
        summary: heuristicSummary(issues),
        source: "heuristic",
      });
    }

    const total = issues.length;
    const resolved = issues.filter((issue) => issue.status === "Resolved").length;
    const rejected = issues.filter((issue) => issue.status === "Rejected").length;
    const open = total - resolved - rejected;

    const deptOpen = new Map<string, number>();
    for (const issue of issues) {
      if (issue.status === "Resolved" || issue.status === "Rejected") {
        continue;
      }
      const dept = issue.assignedDepartmentId || "Unassigned";
      deptOpen.set(dept, (deptOpen.get(dept) ?? 0) + 1);
    }

    const deptSummary = Array.from(deptOpen.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([dept, count]) => `${dept}: ${count}`)
      .join(", ");

    const prompt = [
      "You are generating a short operations status update for a municipal superadmin dashboard.",
      "Return 1 concise paragraph (max 55 words) with tone: practical, calm, actionable.",
      "Include one suggestion.",
      "Use plain text only.",
      `Total issues: ${total}`,
      `Open issues: ${open}`,
      `Resolved: ${resolved}`,
      `Rejected: ${rejected}`,
      `Open issue load by department: ${deptSummary || "No open department load"}`,
    ].join("\n");

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 140,
        },
      }),
    });

    if (!response.ok) {
      return NextResponse.json({
        signature,
        summary: heuristicSummary(issues),
        source: "heuristic",
      });
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      heuristicSummary(issues);

    return NextResponse.json({
      signature,
      summary: text,
      source: "gemini-2.5-flash",
    });
  } catch (error) {
    console.error("Failed to generate live ops status", error);
    return NextResponse.json(
      {
        summary:
          "Live status could not be generated. Continue monitoring department load and open high-priority cases.",
        source: "fallback",
      },
      { status: 200 },
    );
  }
}
