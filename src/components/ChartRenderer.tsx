
import React, { useRef, useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, Brush,
  AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, RadialBarChart, RadialBar,
  Treemap, FunnelChart, Funnel, LabelList,
  ComposedChart
} from 'recharts';
import { VisualizationData } from '../types';
import { DownloadSimple, Table as TableIcon, FileText, ArrowUp, ArrowDown, MagnifyingGlass, Funnel, X, ArrowClockwise, Cpu, TrendUp, Cursor, ArrowsOut, ArrowsIn, ChartBar } from '@phosphor-icons/react';
import html2canvas from 'html2canvas';

const COLORS = [
  '#2563EB', '#0F766E', '#F59E0B', '#0EA5E9', '#14B8A6',
  '#EA580C', '#84CC16', '#DC2626', '#0891B2', '#D97706',
  '#1D4ED8', '#60A5FA', '#34D399', '#F97316', '#B45309',
  '#8C564B', '#17BECF', '#BCBD22', '#FF7F0E', '#7F7F7F'
];

interface ChartRendererProps {
  viz: VisualizationData;
  onDrillDown?: (prompt: string) => void;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({ viz, onDrillDown }) => {
  const { type, data, config, title } = viz;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState<{ [key: string]: string }>({});
  const [isFilterActive, setIsFilterActive] = useState(false);

  const activeFilterCount = useMemo(() => Object.values(filters).filter((v: string) => v.trim() !== '').length, [filters]);

  const handleDataClick = (dataPoint: any) => {
    if (!onDrillDown) return;
    const xAxisLabel = config.xAxis || 'this category';
    const value = dataPoint[xAxisLabel] || 'this point';
    onDrillDown(`Provide a detailed analysis of the data for "${value}" in this chart.`);
  };

  const getPayloadFromChartEvent = (event: any) => {
    const payload = Array.isArray(event?.activePayload) ? event.activePayload[0]?.payload : null;
    return payload || event?.payload || null;
  };

  const handleExportCSV = () => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(','), ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `mastiff-${type}-${Date.now()}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportImage = async () => {
    if (!containerRef.current) return;
    try {
      const el = containerRef.current;
      const scrollablePart = el.querySelector('.overflow-x-auto') as HTMLElement;
      const originalMaxHeight = scrollablePart?.style.maxHeight || '';
      const originalOverflow = scrollablePart?.style.overflow || '';

      if (scrollablePart) {
        scrollablePart.style.maxHeight = 'none';
        scrollablePart.style.overflow = 'visible';
      }

      const canvas = await html2canvas(el, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true
      });

      if (scrollablePart) {
        scrollablePart.style.maxHeight = originalMaxHeight;
        scrollablePart.style.overflow = originalOverflow;
      }

      const link = document.createElement('a');
      link.download = `mastiff-${type}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error(`Export failed:`, err);
    }
  };

  const processedData = useMemo(() => {
    if (!data) return [];
    let result = [...data];
    Object.keys(filters).forEach(key => {
      const filterVal = filters[key].toLowerCase();
      if (filterVal) result = result.filter(row => String(row[key] ?? '').toLowerCase().includes(filterVal));
    });
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key!];
        const bVal = b[sortConfig.key!];
        if (aVal === bVal) return 0;
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        let comparison = isNaN(aNum) || isNaN(bNum) ? String(aVal).localeCompare(String(bVal)) : aNum - bNum;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }
    return result;
  }, [data, sortConfig, filters]);

  // Table rendering
  if (type === 'table') {
    if (!data || data.length === 0) return null;
    const headers = Object.keys(data[0]);
    return (
      <div ref={containerRef} className="w-full glass rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
        <div className="px-5 py-3.5 border-b border-zinc-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-[linear-gradient(135deg,rgba(56,189,248,0.95),rgba(20,184,166,0.88),rgba(245,158,11,0.82))] p-1.5 text-white shadow-lg"><TableIcon size={14} /></div>
            <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">{title}</h3>
            <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">{processedData.length} rows</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setIsFilterActive(!isFilterActive)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-[8px] font-extrabold uppercase tracking-widest ${isFilterActive ? 'bg-[linear-gradient(135deg,rgba(56,189,248,0.95),rgba(20,184,166,0.88))] text-white' : 'glass text-zinc-500 hover:text-white'}`}>
              <Funnel size={11} /> Filter {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 glass rounded-lg text-zinc-500 hover:text-white transition-all text-[8px] font-extrabold uppercase tracking-widest"><DownloadSimple size={11} /> CSV</button>
            <button onClick={handleExportImage} className="flex items-center gap-1.5 px-2.5 py-1.5 glass rounded-lg text-zinc-500 hover:text-white transition-all text-[8px] font-extrabold uppercase tracking-widest"><DownloadSimple size={11} /> PNG</button>
          </div>
        </div>
        {isFilterActive && (
          <div className="px-5 py-2 border-b border-zinc-800/30 flex gap-2 items-center animate-fade-in">
            {headers.slice(0, 4).map(h => (
              <input
                key={h}
                placeholder={`Filter ${h}...`}
                value={filters[h] || ''}
                onChange={e => setFilters(prev => ({ ...prev, [h]: e.target.value }))}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1.5 text-[9px] font-medium text-white placeholder:text-zinc-700 focus:border-sky-300/50"
              />
            ))}
            <button onClick={() => setFilters({})} className="p-1.5 text-zinc-600 hover:text-white"><X size={12} /></button>
          </div>
        )}
        <div className="overflow-x-auto max-h-96 custom-scrollbar">
          <table className="w-full text-sm text-left text-zinc-300">
            <thead className="text-[9px] text-zinc-600 uppercase bg-zinc-950/80 sticky top-0 z-10">
              <tr>
                {headers.map(h => (
                  <th key={h} className="px-5 py-3 font-extrabold border-b border-zinc-800/50 cursor-pointer hover:text-white transition-colors tracking-widest" onClick={() => { setSortConfig({ key: h, direction: sortConfig.key === h && sortConfig.direction === 'asc' ? 'desc' : 'asc' }); }}>
                    <div className="flex items-center gap-1.5">
                      {h} {sortConfig.key === h && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/50">
              {processedData.map((row, i) => (
                <tr key={i} className="cursor-pointer transition-colors hover:bg-sky-400/[0.04]" onClick={() => handleDataClick(row)}>
                  {headers.map(h => <td key={h} className="px-5 py-3 whitespace-nowrap text-zinc-400 text-[11px] font-medium">{row[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const tooltipStyle = { backgroundColor: '#0a0a0a', borderRadius: '12px', border: '1px solid #1f1f1f', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '8px 12px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' };
    const commonProps = { margin: { top: 10, right: 20, left: 0, bottom: 10 } };
    const axisProps = { axisLine: false, tickLine: false, tick: { fontSize: 9, fill: '#666', fontWeight: 600 } };

    switch (type) {
      case 'bar':
        return (
          <BarChart data={data} {...commonProps} onClick={(event) => {
            const payload = getPayloadFromChartEvent(event);
            if (payload) handleDataClick(payload);
          }}>
            <defs>
              {config.keys?.map((key, i) => (
                <linearGradient key={`bar-grad-${key}`} id={`bar-gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={config.xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip cursor={{ fill: 'rgba(99, 110, 250, 0.06)' }} contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
            {config.keys?.map((key, i) => (
              <Bar key={key} dataKey={key} fill={`url(#bar-gradient-${i})`} radius={[6, 6, 0, 0]} barSize={28} animationDuration={800}>
                <LabelList dataKey={key} position="top" style={{ fontSize: '8px', fill: '#888', fontWeight: 700 }} />
              </Bar>
            ))}
            <Brush dataKey={config.xAxis} height={20} stroke="#38BDF8" fill="#0a0a0a" />
          </BarChart>
        );
      case 'composedbar':
        return (
          <ComposedChart data={data} {...commonProps} onClick={(event) => {
            const payload = getPayloadFromChartEvent(event);
            if (payload) handleDataClick(payload);
          }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={config.xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
            {config.keys?.map((key, i) => (
              i === 0 ? (
                <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[6, 6, 0, 0]} barSize={28} animationDuration={800} />
              ) : (
                <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: COLORS[i % COLORS.length] }} animationDuration={1200} />
              )
            ))}
            <Brush dataKey={config.xAxis} height={20} stroke="#38BDF8" fill="#0a0a0a" />
          </ComposedChart>
        );
      case 'line':
        return (
          <LineChart data={data} {...commonProps} onClick={(event) => {
            const payload = getPayloadFromChartEvent(event);
            if (payload) handleDataClick(payload);
          }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={config.xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
            {config.keys?.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: COLORS[i % COLORS.length] }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} animationDuration={1200} />
            ))}
            <Brush dataKey={config.xAxis} height={20} stroke="#38BDF8" fill="#0a0a0a" />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data} {...commonProps} onClick={(event) => {
            const payload = getPayloadFromChartEvent(event);
            if (payload) handleDataClick(payload);
          }}>
            <defs>
              {config.keys?.map((key, i) => (
                <linearGradient key={`grad-${key}`} id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={config.xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
            {config.keys?.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} fill={`url(#gradient-${i})`} animationDuration={1000} />
            ))}
          </AreaChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie data={data} innerRadius={55} outerRadius={95} paddingAngle={4} dataKey="value" nameKey="label" stroke="none" onClick={handleDataClick} animationDuration={800} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
              {data.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />
          </PieChart>
        );
      case 'scatter':
        return (
          <ScatterChart {...commonProps} onClick={(event) => {
            const payload = getPayloadFromChartEvent(event);
            if (payload) handleDataClick(payload);
          }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis type="number" dataKey={config.xAxis} name={config.xAxis} {...axisProps} />
            <YAxis type="number" dataKey={config.yAxis} name={config.yAxis} {...axisProps} />
            <ZAxis range={[40, 250]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle as any} />
            <Scatter name="Data" data={data} fill="#14B8A6" onClick={(e) => handleDataClick(e)} shape="circle" />
          </ScatterChart>
        );
      case 'radar':
        return (
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#1f1f1f" />
            <PolarAngleAxis dataKey={config.xAxis || 'subject'} tick={{ fontSize: 9, fill: '#666', fontWeight: 600 }} />
            <PolarRadiusAxis tick={{ fontSize: 8, fill: '#444' }} />
            {config.keys?.map((key, i) => (
              <Radar key={key} name={key} dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.2} strokeWidth={2} />
            ))}
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
          </RadarChart>
        );
      case 'heatmap': {
        // Render heatmap as a grid using colored cells
        if (!data || data.length === 0) return <div className="flex items-center justify-center h-full text-zinc-600 text-xs">No data</div>;
        const headers = Object.keys(data[0]).filter(h => h !== (config.xAxis || '_row'));
        const rowKey = config.xAxis || Object.keys(data[0])[0];
        const allValues = data.flatMap(row => headers.map(h => Number(row[h]) || 0));
        const minVal = Math.min(...allValues);
        const maxVal = Math.max(...allValues);
        const getHeatColor = (val: number) => {
          const ratio = maxVal === minVal ? 0.5 : (val - minVal) / (maxVal - minVal);
          // Viridis-inspired: deep purple → teal → yellow
          const r = Math.round(68 + ratio * 185);
          const g = Math.round(1 + ratio * 220);
          const b = Math.round(84 + (1 - ratio) * 130);
          return `rgb(${r},${g},${b})`;
        };
        return (
          <div className="w-full h-full overflow-auto custom-scrollbar p-2">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider text-left sticky top-0 bg-zinc-950/90 z-10">{rowKey}</th>
                  {headers.map(h => (
                    <th key={h} className="px-3 py-2 text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider text-center sticky top-0 bg-zinc-950/90 z-10">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, ri) => (
                  <tr key={ri} className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleDataClick(row)}>
                    <td className="px-3 py-2 text-[10px] font-bold text-zinc-300 whitespace-nowrap">{row[rowKey]}</td>
                    {headers.map(h => {
                      const val = Number(row[h]) || 0;
                      return (
                        <td key={h} className="px-3 py-2 text-center" title={`${h}: ${val}`}>
                          <div className="rounded-md px-2 py-1.5 text-[10px] font-bold transition-all hover:scale-105" style={{ backgroundColor: getHeatColor(val), color: val > (minVal + maxVal) / 2 ? '#000' : '#fff' }}>
                            {typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : val}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case 'treemap': {
        if (!data || data.length === 0) return <div className="flex items-center justify-center h-full text-zinc-600 text-xs">No data</div>;
        const treemapData = data.map((d, i) => ({
          ...d,
          fill: COLORS[i % COLORS.length],
        }));
        const TreemapContent = (props: any) => {
          const { x, y, width, height, name, value, fill } = props;
          if (width < 30 || height < 20) return null;
          return (
            <g>
              <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0a0a0a" strokeWidth={2} rx={4} style={{ cursor: 'pointer' }} />
              {width > 50 && height > 30 && (
                <>
                  <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700}>{name}</text>
                  <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={9} fontWeight={600}>
                    {typeof value === 'number' ? value.toLocaleString() : value}
                  </text>
                </>
              )}
            </g>
          );
        };
        return (
          <Treemap data={treemapData} dataKey={config.keys?.[0] || 'value'} nameKey={config.xAxis || 'name'} stroke="#0a0a0a" animationDuration={800}
            content={<TreemapContent />}>
            <Tooltip contentStyle={tooltipStyle as any} />
          </Treemap>
        );
      }
      case 'funnel':
        return (
          <FunnelChart>
            <Tooltip contentStyle={tooltipStyle as any} />
            <Funnel dataKey={config.keys?.[0] || 'value'} nameKey={config.xAxis || 'name'} data={data} isAnimationActive animationDuration={800}>
              {data.map((_entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              <LabelList position="right" fill="#fff" stroke="none" style={{ fontSize: '10px', fontWeight: 700 }} />
            </Funnel>
          </FunnelChart>
        );
      default:
        return <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-700"><ArrowClockwise className="animate-spin" size={28} /></div>;
    }
  };

  return (
    <div ref={containerRef} className={`w-full overflow-hidden rounded-[28px] border border-sky-300/15 bg-[linear-gradient(180deg,rgba(15,24,40,0.96),rgba(7,14,25,0.84))] p-5 shadow-[0_24px_80px_rgba(2,6,23,0.3)] animate-fade-in group transition-all ${isExpanded ? 'fixed inset-4 z-50' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-[linear-gradient(180deg,#38BDF8,#14B8A6,#F59E0B)]" />
            {title}
          </h3>
          <p className="ml-3 mt-0.5 flex items-center gap-1 text-[8px] font-bold uppercase tracking-[2px] text-slate-400">
            <Cursor size={8} /> Click to drill down
          </p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setIsExpanded(!isExpanded)} className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition-all hover:border-sky-300/30 hover:text-white">
            {isExpanded ? <ArrowsIn size={12} /> : <ArrowsOut size={12} />}
          </button>
          <button onClick={handleExportCSV} className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition-all hover:border-sky-300/30 hover:text-white" title="Export CSV">
            <FileText size={12} />
          </button>
          <button onClick={handleExportImage} className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-400 transition-all hover:border-sky-300/30 hover:text-white" title="Export Image">
            <DownloadSimple size={12} />
      <div className={`w-full ${isExpanded ? 'h-[calc(100vh-120px)]' : 'h-[320px]'}`}>
        <ResponsiveContainer width="100%" height="100%">
          {renderContent()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
