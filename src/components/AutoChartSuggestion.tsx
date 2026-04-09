"use client";

import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area,
  ComposedChart,
  type DotItemDotProps
} from 'recharts';
import { ChartBar, TrendUp, ChartPie, ChartLine, CaretDown, CaretUp, ChartLineUp } from '@phosphor-icons/react';

const CHART_COLORS = [
  '#38BDF8', '#14B8A6', '#F59E0B', '#818CF8', '#22C55E',
  '#F97316', '#0EA5E9', '#A3E635', '#FACC15', '#06B6D4',
];

interface AutoChartSuggestionProps {
  data: any[];
  title?: string;
}

type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'forecast';

interface ChartOption {
  type: ChartType;
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

  const analysis = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return null;

    const headers = Object.keys(data[0]);
    if (headers.length < 2) return null;

    // Detect numeric and categorical columns
    const numericCols: string[] = [];
    const categoricalCols: string[] = [];

    headers.forEach(h => {
      const values = data.map(row => row[h]).filter(v => v != null && v !== '');
      const numericCount = values.filter(v => !isNaN(Number(v)) && typeof v !== 'boolean').length;
      if (numericCount > values.length * 0.7 && values.length > 0) {
        numericCols.push(h);
      } else {
        categoricalCols.push(h);
      }
    });

    if (numericCols.length === 0) return null;

    // Pick the best category (x-axis) and metric columns
    const xAxis = categoricalCols.length > 0 ? categoricalCols[0] : headers[0];
    const metricKeys = numericCols.slice(0, 5); // Max 5 metrics

    // Determine best default chart type
    let defaultType: ChartType = 'bar';
    const uniqueX = new Set(data.map(row => row[xAxis])).size;

    if (uniqueX <= 6 && metricKeys.length === 1) {
      defaultType = 'pie';
    } else if (uniqueX > 10) {
      defaultType = 'line';
    } else {
      defaultType = 'bar';
    }

    // Prepare pie data
    const pieData = metricKeys.length > 0
      ? data.slice(0, 12).map(row => ({
        name: String(row[xAxis] ?? ''),
        value: Math.abs(Number(row[metricKeys[0]]) || 0),
      }))
      : [];

    return { xAxis, metricKeys, defaultType, pieData, numericCols, categoricalCols };
  }, [data]);

  const [activeChart, setActiveChart] = useState<ChartType | null>(null);

  // Use default chart type from analysis
  const chartType = activeChart ?? analysis?.defaultType ?? 'bar';

  if (!analysis || !data || data.length === 0) return null;

  const { xAxis, metricKeys, pieData } = analysis;
  const tooltipStyle = { backgroundColor: '#08111f', borderRadius: '12px', border: '1px solid rgba(125,211,252,0.22)', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '8px 12px', boxShadow: '0 10px 28px rgba(3,7,18,0.45)' };
  const axisProps = { axisLine: false, tickLine: false, tick: { fontSize: 9, fill: '#94a3b8', fontWeight: 700 } };

  // Convert data for chart (ensure numbers)
  const chartData = data.slice(0, 50).map(row => {
    const item: any = { [xAxis]: row[xAxis] };
    metricKeys.forEach(k => { item[k] = Number(row[k]) || 0; });
    return item;
  });

  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <defs>
              {metricKeys.map((key, i) => (
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
            {metricKeys.length > 1 && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />}
            {metricKeys.map((key, i) => (
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
            {metricKeys.length > 1 && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />}
            {metricKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2.5} dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 0 }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} animationDuration={1000} />
            ))}
          </LineChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie data={pieData} innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name" stroke="none" animationDuration={800}
              label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}>
              {pieData.map((_entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />
          </PieChart>
        );
      case 'area':
        return (
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <defs>
              {metricKeys.map((key, i) => (
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
            {metricKeys.length > 1 && <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />}
            {metricKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} fill={`url(#auto-area-grad-${i})`} animationDuration={1000} />
            ))}
          </AreaChart>
        );
      case 'forecast': {
        // Least-squares linear regression for robust slope estimate across all data points.
        // Requires at least 2 data points.
        const n = chartData.length;
        if (n < 2) return null;
        const yKey = metricKeys[0];
        const ys = chartData.map((d, i) => ({ x: i, y: Number(d[yKey] ?? 0) }));
        const sumX = ys.reduce((s, p) => s + p.x, 0);
        const sumY = ys.reduce((s, p) => s + p.y, 0);
        const sumXY = ys.reduce((s, p) => s + p.x * p.y, 0);
        const sumXX = ys.reduce((s, p) => s + p.x * p.x, 0);
        const denom = n * sumXX - sumX * sumX;
        const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
        const intercept = (sumY - slope * sumX) / n;
        // Residual std deviation for confidence band
        const residuals = ys.map(p => p.y - (slope * p.x + intercept));
        const variance = residuals.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2);
        const stdDev = Math.sqrt(variance);
        const lastY = slope * (n - 1) + intercept;
        const forecastPoints = [1, 2, 3].map(i => {
            const projected = slope * (n - 1 + i) + intercept;
            const ci = stdDev * (1 + i * 0.1); // widening band
            return {
                [xAxis]: `F+${i}`,
                [yKey]: Math.max(0, projected),
                isForecast: true,
                upper: Math.max(0, projected + ci),
                lower: Math.max(0, projected - ci),
            };
        });
        void lastY; // referenced indirectly via slope/intercept
        const combined = [...chartData.map(d => ({ ...d, isForecast: false })), ...forecastPoints];
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
                <Line type="monotone" dataKey={yKey} stroke="#38BDF8" strokeWidth={2.5}
                    dot={(props: DotItemDotProps): React.ReactNode =>
                        (props as DotItemDotProps & { payload?: { isForecast?: boolean } }).payload?.isForecast
                            ? <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="#54A0FF" stroke="#fff" strokeWidth={1.5} />
                            : <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#38BDF8" strokeWidth={0} />
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
            {title ? `Chart · ${title}` : 'Auto-Generated Chart'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Chart type switcher */}
          <div className="flex gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {CHART_OPTIONS.map(opt => (
              <button
                key={opt.type}
                onClick={() => setActiveChart(opt.type)}
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
        <div className="h-[280px] w-full p-4">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart() || <div />}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
