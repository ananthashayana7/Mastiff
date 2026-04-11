"use client";

import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area,
  ComposedChart,
  type DotItemDotProps
} from 'recharts';
import { ChartBar, TrendUp, ChartPie, ChartLine, CaretDown, CaretUp, ChartLineUp } from '@phosphor-icons/react';
import { analyzeAutoChartData, buildForecastBasisLabel, type AutoChartType, type ForecastModel } from '../lib/autoChartPresentation';

const CHART_COLORS = [
  '#6C8AE4', '#2FA7A0', '#D39A3A', '#43B66E', '#C76552',
  '#8B6ED6', '#52C3E2', '#B68B57', '#5A9D84', '#D97A4A',
];

interface AutoChartSuggestionProps {
  data: any[];
  title?: string;
}

interface ChartOption {
  type: AutoChartType;
  label: string;
  icon: React.ReactNode;
}

const CHART_OPTIONS: ChartOption[] = [
  { type: 'bar', label: 'Bar', icon: <ChartBar size={12} weight="bold" /> },
  { type: 'line', label: 'Line', icon: <ChartLine size={12} weight="bold" /> },
  { type: 'pie', label: 'Pie', icon: <ChartPie size={12} weight="bold" /> },
  { type: 'area', label: 'Area', icon: <ChartLineUp size={12} weight="bold" /> },
  { type: 'forecast', label: 'Forecast', icon: <TrendUp size={12} weight="bold" /> },
];

/**
 * AutoChartSuggestion analyzes tabular result data and auto-renders
 * the most suitable chart alongside the table. Users can toggle
 * between chart types interactively.
 */
export const AutoChartSuggestion: React.FC<AutoChartSuggestionProps> = ({ data, title }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [forecastModel, setForecastModel] = useState<ForecastModel>('linear');
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<AutoChartType | null>(null);
  const deferredData = useDeferredValue(data);

  const analysis = useMemo(() => {
    return analyzeAutoChartData(Array.isArray(deferredData) ? deferredData : []);
  }, [deferredData]);

  useEffect(() => {
    if (!analysis) {
      setActiveMetric(null);
      setActiveChart(null);
      return;
    }

    setActiveMetric((current) => (current && analysis.metricKeys.includes(current)) ? current : analysis.forecastMetric);
    setActiveChart((current) => (current && analysis.availableChartTypes.includes(current)) ? current : null);
  }, [analysis]);

  // Use default chart type from analysis
  const chartType = activeChart ?? analysis?.defaultType ?? 'bar';

  if (!analysis || !deferredData || deferredData.length === 0) return null;

  const { xAxis, metricKeys, pieData, resolvedTitle, financeLike, timeSeriesLike } = analysis;
  const selectedMetric = activeMetric || analysis.forecastMetric;
  const tooltipStyle = { backgroundColor: '#08111f', borderRadius: '12px', border: '1px solid rgba(125,211,252,0.22)', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '8px 12px', boxShadow: '0 10px 28px rgba(3,7,18,0.45)' };
  const axisProps = { axisLine: false, tickLine: false, tick: { fontSize: 9, fill: '#94a3b8', fontWeight: 700 } };
  const visibleMetricKeys = Array.from(new Set(
    chartType === 'forecast' || chartType === 'pie'
      ? [selectedMetric]
      : [selectedMetric, ...metricKeys]
  )).slice(0, financeLike ? 4 : 3);

  // Convert data for chart (ensure numbers)
  const chartData = deferredData.slice(0, 24).map(row => {
    const item: any = { [xAxis]: row[xAxis] };
    metricKeys.forEach(k => { item[k] = Number(String(row[k] ?? '').replace(/,/g, '')) || 0; });
    return item;
  });

  const periods = chartData.map((row) => String(row[xAxis] ?? '')).filter(Boolean);
  const forecastBasis = buildForecastBasisLabel(selectedMetric, forecastModel, periods);

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <defs>
              {visibleMetricKeys.map((key, i) => (
                <linearGradient key={`auto-bar-${key}`} id={`auto-bar-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.55} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle as any} cursor={{ fill: 'rgba(99, 110, 250, 0.06)' }} />
            {visibleMetricKeys.length > 1 && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />}
            {visibleMetricKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={`url(#auto-bar-grad-${i})`} radius={[5, 5, 0, 0]} animationDuration={800} />
            ))}
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle as any} />
            {visibleMetricKeys.length > 1 && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />}
            {visibleMetricKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 0 }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} animationDuration={1000} />
            ))}
          </LineChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie data={pieData} innerRadius={58} outerRadius={88} paddingAngle={2} dataKey="value" nameKey="name" stroke="none" animationDuration={800} label={false} labelLine={false}>
              {pieData.map((_entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />
          </PieChart>
        );
      case 'area':
        return (
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <defs>
              {visibleMetricKeys.map((key, i) => (
                <linearGradient key={`auto-area-${key}`} id={`auto-area-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle as any} />
            {visibleMetricKeys.length > 1 && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />}
            {visibleMetricKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} fill={`url(#auto-area-grad-${i})`} animationDuration={1000} />
            ))}
          </AreaChart>
        );
      case 'forecast': {
        const n = chartData.length;
        if (n < 2) return null;
        const yKey = selectedMetric;
        const ys = chartData.map((d, i) => ({ x: i, y: Number(d[yKey] ?? 0) }));
        const sumX = ys.reduce((s, p) => s + p.x, 0);
        const sumY = ys.reduce((s, p) => s + p.y, 0);
        const sumXY = ys.reduce((s, p) => s + p.x * p.y, 0);
        const sumXX = ys.reduce((s, p) => s + p.x * p.x, 0);
        const denom = n * sumXX - sumX * sumX;
        const linearSlope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
        const linearIntercept = (sumY - linearSlope * sumX) / n;
        const movingWindow = ys.slice(-Math.min(3, ys.length));
        const movingAverage = movingWindow.reduce((sum, point) => sum + point.y, 0) / Math.max(1, movingWindow.length);
        const momentumDeltas = ys.slice(-3).map((point, index, source) => {
          if (index === 0) return 0;
          return point.y - source[index - 1].y;
        }).slice(1);
        const momentumDelta = momentumDeltas.length > 0
          ? momentumDeltas.reduce((sum, value) => sum + value, 0) / momentumDeltas.length
          : linearSlope;

        const projectValue = (step: number) => {
          if (forecastModel === 'movingAverage') {
            return movingAverage;
          }
          if (forecastModel === 'momentum') {
            return ys[ys.length - 1].y + (momentumDelta * step);
          }
          return linearIntercept + (linearSlope * (n - 1 + step));
        };

        const residuals = ys.map((point, index) => {
          const fitted = forecastModel === 'movingAverage'
            ? movingAverage
            : forecastModel === 'momentum'
              ? ys[0].y + (momentumDelta * index)
              : linearSlope * point.x + linearIntercept;
          return point.y - fitted;
        });
        const variance = residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2);
        const stdDev = Math.sqrt(Math.max(variance, 0));
        const forecastPoints = [1, 2, 3].map(i => {
            const projected = projectValue(i);
            const ci = stdDev * (1 + i * 0.1); // widening band
            return {
                [xAxis]: `F+${i}`,
                [yKey]: Math.max(0, projected),
                isForecast: true,
                upper: Math.max(0, projected + ci),
                lower: Math.max(0, projected - ci),
            };
        });
        const combined = [...chartData.map(d => ({ ...d, isForecast: false })), ...forecastPoints];
        const modelLabel = forecastModel === 'movingAverage'
          ? 'Moving average'
          : forecastModel === 'momentum'
            ? 'Momentum'
            : 'Linear trend';
        return (
            <ComposedChart data={combined} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <defs>
                    <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#54A0FF" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#54A0FF" stopOpacity={0.02} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
                <XAxis dataKey={xAxis} {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip contentStyle={tooltipStyle as any} />
                <Area type="monotone" dataKey="upper" fill="url(#forecastGrad)" stroke="none" name="Confidence Band" />
                <Area type="monotone" dataKey="lower" fill="rgba(0,0,0,0)" stroke="none" />
                <Line type="monotone" dataKey={yKey} stroke="#52C3E2" strokeWidth={2.5}
                  name={`${modelLabel} forecast`}
                    dot={(props: DotItemDotProps): React.ReactNode =>
                        (props as DotItemDotProps & { payload?: { isForecast?: boolean } }).payload?.isForecast
                            ? <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="#54A0FF" stroke="#fff" strokeWidth={1.5} />
                            : <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#52C3E2" strokeWidth={0} />
                    }
                    animationDuration={1000} />
            </ComposedChart>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="w-full overflow-hidden rounded-[26px] border border-sky-300/15 bg-[linear-gradient(180deg,rgba(15,24,40,0.96),rgba(7,14,25,0.86))] shadow-[0_24px_72px_rgba(2,6,23,0.28)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-[linear-gradient(135deg,rgba(56,189,248,0.95),rgba(251,113,133,0.9),rgba(45,212,191,0.82))] p-1.5 shadow-lg">
            <ChartBar size={12} className="text-white" />
          </div>
          <span className="bg-[linear-gradient(135deg,#c7f2ff,#fecdd3,#b2f5ea)] bg-clip-text text-[10px] font-extrabold uppercase tracking-[0.22em] text-transparent">
            {title && title !== 'Auto-Rendered Chart' ? `Chart · ${title}` : `Chart · ${resolvedTitle}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="md:hidden rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
            <label className="sr-only" htmlFor={`auto-chart-metric-${title || resolvedTitle}`}>Metric</label>
            <select
              id={`auto-chart-metric-${title || resolvedTitle}`}
              value={selectedMetric}
              onChange={(event) => startTransition(() => setActiveMetric(event.target.value))}
              className="bg-transparent text-[9px] font-bold uppercase tracking-[0.14em] text-slate-200 outline-none"
            >
              {metricKeys.map((metric) => (
                <option key={metric} value={metric} className="bg-slate-900 text-slate-100">
                  {metric}
                </option>
              ))}
            </select>
          </div>
          {/* Chart type switcher */}
          <div className="flex gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {CHART_OPTIONS.filter((option) => analysis.availableChartTypes.includes(option.type)).map(opt => (
              <button
                key={opt.type}
                onClick={() => startTransition(() => setActiveChart(opt.type))}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[8px] font-bold uppercase tracking-wider transition-all ${
                  chartType === opt.type
                    ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.95),rgba(251,113,133,0.88))] text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>
          <div className="hidden md:flex gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {metricKeys.map((metric) => (
              <button
                key={metric}
                onClick={() => startTransition(() => setActiveMetric(metric))}
                className={`px-2 py-1 rounded-md text-[8px] font-bold tracking-wide transition-all ${selectedMetric === metric
                  ? 'bg-[linear-gradient(135deg,rgba(108,138,228,0.96),rgba(47,167,160,0.88))] text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
                  }`}
                title={metric}
              >
                {metric.length > 18 ? `${metric.slice(0, 18)}…` : metric}
              </button>
            ))}
          </div>
          {chartType === 'forecast' && (
            <div className="flex gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1">
              {([
                { key: 'linear', label: 'Linear' },
                { key: 'movingAverage', label: 'Average' },
                { key: 'momentum', label: 'Momentum' },
              ] as Array<{ key: ForecastModel; label: string }>).map((option) => (
                <button
                  key={option.key}
                  onClick={() => startTransition(() => setForecastModel(option.key))}
                  className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase tracking-wider transition-all ${forecastModel === option.key
                    ? 'bg-[linear-gradient(135deg,rgba(14,165,233,0.92),rgba(96,165,250,0.84))] text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                    }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-slate-400 transition-colors hover:text-white"
          >
            {isCollapsed ? <CaretDown size={14} /> : <CaretUp size={14} />}
          </button>
        </div>
      </div>

      {/* Chart */}
      {!isCollapsed && (
        <div className="w-full p-4">
          {(chartType === 'forecast' || financeLike || timeSeriesLike) && (
            <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-slate-300">
              <span className="font-extrabold uppercase tracking-[0.16em] text-sky-200">Basis</span>
              <span className="ml-2 text-slate-200">{chartType === 'forecast' ? forecastBasis : `Showing ${visibleMetricKeys.join(', ')} against ${xAxis}.`}</span>
            </div>
          )}
          <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart() || <div />}
          </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
