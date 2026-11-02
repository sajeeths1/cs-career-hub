"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FollowCompanyButton } from "@/components/follow-company-button";
import { fetchCompanies, fetchFollowedCompanyIds, fetchPriorityCompanyIds, setFollowedCompany } from "@/lib/data";
import { MAX_PRIORITY_COMPANIES } from "@/lib/notifications";
import type { Company } from "@/lib/types";

/** Prioritize up to 10 companies for alerts. Old follows can be cleared. */
export function CompaniesTab({ userId, onPriorityToggled }: { userId: string; onPriorityToggled?: (companyId: number, priority: boolean) => void }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [followedIds, setFollowedIds] = useState<number[]>([]);
  const [priorityIds, setPriorityIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [clearing, setClearing] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchCompanies(), fetchFollowedCompanyIds(userId), fetchPriorityCompanyIds(userId)])
      .then(([companyRows, followed, priority]) => {
        if (!active) return;
        setCompanies(companyRows);
        setFollowedIds(followed);
        setPriorityIds(priority);
      })
      .catch((err: Error) => { if (active) setLoadError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId, attempt]);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? companies.filter((company) => company.name.toLowerCase().includes(term)) : companies;
  }, [companies, search]);

  function handlePriorityToggled(companyId: number, priority: boolean) {
    setPriorityIds((ids) => (priority ? [...ids, companyId] : ids.filter((id) => id !== companyId)));
    if (!priority) setFollowedIds((ids) => ids.filter((id) => id !== companyId));
    onPriorityToggled?.(companyId, priority);
  }

  const oldFollows = followedIds.filter((id) => !priorityIds.includes(id));

  async function clearOldFollows() {
    setClearing(true);
    setLoadError(null);
    try {
      for (const companyId of oldFollows) await setFollowedCompany(userId, companyId, false);
      setFollowedIds((ids) => ids.filter((id) => !oldFollows.includes(id)));
    } catch (err) {
      setLoadError((err as Error).message);
      setAttempt((n) => n + 1);
    } finally { setClearing(false); }
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      {loadError ? (
        <div role="alert" className="grid gap-2 text-sm text-red-600">
          <p>Could not load companies: {loadError}</p>
          <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Priority companies</CardTitle>
          <CardDescription>
            Choose up to {MAX_PRIORITY_COMPANIES} companies for job alerts. Alert timing is configured alongside this list.
            {" "}{priorityIds.length} / {MAX_PRIORITY_COMPANIES} prioritized.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading companies…</p> : null}
          {!loading ? (
            <>
              {oldFollows.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="flex-1">You still have {oldFollows.length} company {oldFollows.length === 1 ? "follow" : "follows"} from the old setup. Remove them to stop their digest alerts.</p>
                <Button variant="outline" size="sm" disabled={clearing} onClick={() => void clearOldFollows()}>{clearing ? "Removing…" : "Remove old follows"}</Button>
              </div>}
              <Input
                aria-label="Find a company"
                placeholder="Find a company"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="grid gap-2">
                {filteredCompanies.map((company) => (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-2" key={company.id}>
                    {company.logo_url ? (
                      <img alt="" className="h-6 w-6 shrink-0 rounded object-contain" src={company.logo_url} />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{company.name}</span>
                    <FollowCompanyButton
                      companyId={company.id}
                      companyName={company.name}
                      isActive={priorityIds.includes(company.id)}
                      onToggled={handlePriorityToggled}
                      userId={userId}
                    />
                  </div>
                ))}
              </div>
              {filteredCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground">No companies match this search.</p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
