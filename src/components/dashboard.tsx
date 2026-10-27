"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatAgo, formatClock, formatKwDetail, formatKwh, formatPower } from "@/lib/format";
import { emptySnapshot, sampleSnapshot } from "@/lib/sample";
import type { EnergyFigure, Health, Panel, SolarSnapshot } from "@/lib/types";

const REFRESH_MS = 20_000;

type Filter = "all" | Health;

const healthClass: Record<Health, string> = {
  healthy: "bg-emerald-400/15 text-emerald-200",
  warning: "bg-amber-300/15 text-amber-100",
  offline: "bg-rose-400/15 text-rose-200",
};

export function Dashboard() {
  const [snapshot, setSnapshot] = useState<SolarSnapshot | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [ipInput, setIpInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (isFirst: boolean) => {
    if (!isFirst) setRefreshing(true);
    try {
      const response = await fetch("/api/solar", { cache: "no-store" });
      const body = (await response.json()) as SolarSnapshot;
      setSnapshot(body);
      setPhase("ready");
      if (body.gateway?.ip) setIpInput((current) => current || body.gateway?.ip || "");
    } catch {
      setSnapshot(
        sampleSnapshot("The monitor page could not reach its own data service."),
      );
      setPhase("failed");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).get("preview");
    if (preview === "loading" || preview === "empty" || preview === "error") {
      const timer = setTimeout(() => {
        if (preview === "loading") return;
        if (preview === "empty") {
          setSnapshot(emptySnapshot("192.168.1.15"));
          setPhase("ready");
          return;
        }
        setSnapshot(sampleSnapshot("No SunPower gateway responded on this local network."));
        setPhase("ready");
      }, 0);
      return () => clearTimeout(timer);
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick(isFirst: boolean) {
      if (cancelled) return;
      await load(isFirst);
      if (cancelled) return;
      timer = setTimeout(() => tick(false), REFRESH_MS);
    }

    void tick(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load, reloadKey]);

  async function saveIp(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: ipInput.trim() }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) {
        setFormError(body.error ?? "That address did not respond as a SunPower gateway.");
        return;
      }
      setReloadKey((value) => value + 1);
    } catch {
      setFormError("Could not save that address.");
    } finally {
      setSaving(false);
    }
  }

  async function rediscover() {
    setFormError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/gateway", { method: "DELETE" });
      if (!response.ok) {
        setFormError("Could not start discovery.");
        return;
      }
      setReloadKey((value) => value + 1);
    } catch {
      setFormError("Could not start discovery.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative min-h-full flex-1">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.42_0.09_85/0.35),transparent_52%)]" />
      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-[0.22em] text-primary uppercase">
              Home solar
            </p>
            <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Solar Monitor</h1>
            <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
              Live readings from the SunPower supervisor on this network.
            </p>
          </div>
          <StatusLine snapshot={snapshot} phase={phase} refreshing={refreshing} />
        </header>

        {phase === "loading" || !snapshot ? (
          <LoadingState />
        ) : (
          <LiveState
            snapshot={snapshot}
            filter={filter}
            onFilter={setFilter}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Gateway address</CardTitle>
            <CardDescription>
              Discovery searches this computer’s local subnet. Set an address if the
              supervisor is on a different IP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveIp} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="gateway-ip">
                Gateway IP address
              </label>
              <Input
                id="gateway-ip"
                name="ip"
                inputMode="decimal"
                autoComplete="off"
                placeholder="192.168.1.15"
                value={ipInput}
                onChange={(event) => setIpInput(event.target.value)}
                className="sm:max-w-xs"
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Checking…" : "Use this IP"}
                </Button>
                <Button type="button" variant="outline" onClick={rediscover} disabled={saving}>
                  Discover
                </Button>
              </div>
            </form>
            {formError ? (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function reportLine(panel: Panel): string {
  const when = formatAgo(panel.lastData);
  const state = panel.state.trim().toLowerCase();
  const noFault = panel.statInd == null || panel.statInd === "" || panel.statInd === "0";
  if (noFault && state === "error") return `Last report · ${when}`;
  const label = panel.stateDescr || panel.state || "unknown";
  return `Gateway: ${label} · ${when}`;
}

function StatusLine({
  snapshot,
  phase,
  refreshing,
}: {
  snapshot: SolarSnapshot | null;
  phase: "loading" | "ready" | "failed";
  refreshing: boolean;
}) {
  if (phase === "loading" || !snapshot) {
    return <p className="text-sm text-muted-foreground">Looking for the gateway…</p>;
  }
  const gateway = snapshot.gateway;
  return (
    <div className="flex flex-col items-start gap-1 text-sm sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={snapshot.source === "live" ? "secondary" : "destructive"}>
          {snapshot.source === "live" ? "Live" : "Sample data"}
        </Badge>
        {refreshing ? <span className="text-muted-foreground">Refreshing</span> : null}
      </div>
      <p className="text-muted-foreground">
        {gateway
          ? `${gateway.model || "Gateway"} · ${gateway.ip}${gateway.firmware ? ` · ${gateway.firmware}` : ""}`
          : "No gateway"}
      </p>
      <p className="text-muted-foreground">Updated {formatClock(snapshot.fetchedAt)}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted-foreground">Loading production and panel health…</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
        <Skeleton className="h-44 sm:col-span-2 lg:col-span-1" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
    </div>
  );
}

function LiveState({
  snapshot,
  filter,
  onFilter,
}: {
  snapshot: SolarSnapshot;
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  const power = formatPower(snapshot.production.powerKw);
  const powerDetail = formatKwDetail(snapshot.production.powerKw);
  const panels =
    filter === "all"
      ? snapshot.panels
      : snapshot.panels.filter((panel) => panel.health === filter);
  const noProduction =
    snapshot.source === "live" &&
    snapshot.production.powerKw == null &&
    snapshot.production.lifetimeKwh == null;
  const noPanels = snapshot.panels.length === 0;

  return (
    <div className="space-y-6">
      {snapshot.source === "sample" ? (
        <div
          className="rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-50"
          role="alert"
        >
          <p className="font-medium">Sample data — the gateway is not connected.</p>
          <p className="mt-1 text-amber-50/80">
            {snapshot.error ?? "These numbers are examples, not your system."}
          </p>
        </div>
      ) : null}
      {snapshot.error && snapshot.source === "live" ? (
        <p className="rounded-xl border border-destructive/40 px-4 py-3 text-sm text-destructive" role="alert">
          {snapshot.error}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardDescription>Current production</CardDescription>
            <CardTitle className="sr-only">Current production</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {noProduction ? (
              <EmptyFigure
                title="No production data"
                body="The gateway did not include a production meter reading."
              />
            ) : (
              <>
                <p className="font-display text-6xl tracking-tight text-primary sm:text-7xl">
                  {power.primary}
                  <span className="ml-2 text-2xl text-primary/80">{power.unit}</span>
                </p>
                {powerDetail ? (
                  <p className="text-sm text-muted-foreground">{powerDetail} from the production meter</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Production meter, live power</p>
                )}
                {snapshot.production.lifetimeKwh != null ? (
                  <p className="pt-4 text-sm text-muted-foreground">
                    Lifetime {formatKwh(snapshot.production.lifetimeKwh)}
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <EnergyCard label="Today" figure={snapshot.production.today} />
        <EnergyCard label="This month" figure={snapshot.production.month} />
      </section>

      {snapshot.source === "live" &&
      (snapshot.production.today.partial || snapshot.production.month.partial) ? (
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {snapshot.production.intervalNote}
        </p>
      ) : null}

      <section className="space-y-4" aria-labelledby="panels-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="panels-heading" className="font-display text-3xl tracking-tight">
              Panel health
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {snapshot.summary.total === 0
                ? "No inverters in the latest reading."
                : `${snapshot.summary.total} panels · ${snapshot.summary.healthy} healthy · ${snapshot.summary.warning} warning · ${snapshot.summary.offline} offline`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterButton current={filter} value="all" onFilter={onFilter} count={snapshot.summary.total} />
            <FilterButton current={filter} value="healthy" onFilter={onFilter} count={snapshot.summary.healthy} />
            <FilterButton current={filter} value="warning" onFilter={onFilter} count={snapshot.summary.warning} />
            <FilterButton current={filter} value="offline" onFilter={onFilter} count={snapshot.summary.offline} />
          </div>
        </div>

        {noPanels ? (
          <Card>
            <CardContent className="py-8">
              <EmptyFigure
                title="No panels reported"
                body="The gateway device list did not include inverters or panels."
              />
            </CardContent>
          </Card>
        ) : panels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No panels in this filter.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {panels.map((panel) => {
              const panelPower = formatPower(panel.powerKw);
              return (
                <Card key={panel.id} size="sm" className="min-w-0">
                  <CardHeader className="gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge className={healthClass[panel.health]}>
                        {panel.health === "healthy"
                          ? "Healthy"
                          : panel.health === "warning"
                            ? "Warning"
                            : "Offline"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {panel.temperatureC != null ? `${Math.round(panel.temperatureC)}°C` : ""}
                      </span>
                    </div>
                    <CardTitle className="truncate font-mono text-xs" title={panel.serial}>
                      {panel.serial}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="font-display text-2xl tracking-tight">
                      {panelPower.primary}
                      <span className="ml-1 text-sm text-muted-foreground">{panelPower.unit}</span>
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">{panel.detail}</p>
                    <p className="text-xs text-muted-foreground">{reportLine(panel)}</p>
                    {panel.lifetimeKwh != null ? (
                      <p className="text-xs text-muted-foreground">
                        Lifetime {formatKwh(panel.lifetimeKwh)}
                      </p>
                    ) : null}
                    {panel.note ? <p className="text-xs leading-5 text-amber-100">{panel.note}</p> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function EnergyCard({ label, figure }: { label: string; figure: EnergyFigure }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="sr-only">{label} production</CardTitle>
      </CardHeader>
      <CardContent>
        {figure.kwh == null ? (
          <EmptyFigure title={figure.label} body={figure.detail} />
        ) : (
          <div className="space-y-1">
            <p className="font-display text-4xl tracking-tight sm:text-5xl">
              {formatKwh(figure.kwh).replace(/ kWh$/, "")}
              <span className="ml-2 text-2xl text-foreground/80">kWh</span>
            </p>
            <p className="text-sm text-foreground">{figure.label}</p>
            <p className="text-sm leading-6 text-muted-foreground">{figure.detail}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyFigure({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="font-display text-3xl tracking-tight text-muted-foreground">{title}</p>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function FilterButton({
  current,
  value,
  count,
  onFilter,
}: {
  current: Filter;
  value: Filter;
  count: number;
  onFilter: (filter: Filter) => void;
}) {
  const label = value === "all" ? "All" : value[0].toUpperCase() + value.slice(1);
  return (
    <Button
      type="button"
      size="sm"
      variant={current === value ? "default" : "outline"}
      onClick={() => onFilter(value)}
      aria-pressed={current === value}
    >
      {label} {count}
    </Button>
  );
}
