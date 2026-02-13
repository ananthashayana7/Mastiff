
import React, { useRef, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, Brush
} from 'recharts';
import { VisualizationData } from '../types';
import { Download, Table as TableIcon, FileText, ArrowUp, ArrowDown, Search, Filter, X, RefreshCw, Cpu, TrendingUp, MousePointer2 } from 'lucide-react';
import html2canvas from 'html2canvas';

const COLORS = ['#E50914', '#B20710', '#F5F5F1', '#D2D2D2', '#564D4D', '#808080', '#FF4D4D', '#A1060E'];

interface ChartRendererProps {
  viz: VisualizationData;
  onDrillDown?: (prompt: string) => void;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({ viz, onDrillDown }) => {
  const { type, data, config, title } = viz;
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleExport = async () => {
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
        backgroundColor: '#141414',
        scale: 2,
        useCORS: true
      });
      
      if (scrollablePart) {
        scrollablePart.style.maxHeight = originalMaxHeight;
        scrollablePart.style.overflow = originalOverflow;
      }

      const link = document.createElement('a');
      link.download = `beagle-${type}-${Date.now()}.png`;
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

  if (type === 'table') {
    if (!data || data.length === 0) return null;
    const headers = Object.keys(data[0]);
    return (
      <div ref={containerRef} className="mt-6 bg-[#181818] border border-zinc-800 rounded-lg overflow-hidden relative shadow-2xl animate-in fade-in">
        <div className="px-6 py-4 border-b border-zinc-800 bg-[#1f1f1f] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#E50914] text-white rounded shadow-lg"><TableIcon size={16} /></div>
            <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsFilterActive(!isFilterActive)} className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-all text-[10px] font-black uppercase tracking-widest ${isFilterActive ? 'bg-[#E50914] border-[#E50914] text-white' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}>
              <Filter size={14} /> Filter {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-700 text-zinc-500 hover:text-white rounded-lg transition-all text-[10px] font-black uppercase tracking-widest"><Download size={14} /> Save</button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-96 custom-scrollbar">
          <table className="w-full text-sm text-left text-zinc-300">
            <thead className="text-[11px] text-zinc-500 uppercase bg-black sticky top-0 z-10">
              <tr>
                {headers.map(h => (
                  <th key={h} className="px-6 py-4 font-extrabold border-b border-zinc-800 cursor-pointer hover:text-white transition-colors" onClick={() => { setSortConfig({ key: h, direction: sortConfig.key === h && sortConfig.direction === 'asc' ? 'desc' : 'asc' }); }}>
                    <div className="flex items-center justify-between">
                      {h} {sortConfig.key === h && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {processedData.map((row, i) => (
                <tr key={i} className="hover:bg-zinc-800/50 transition-colors cursor-pointer" onClick={() => handleDataClick(row)}>
                  {headers.map(h => <td key={h} className="px-6 py-4 whitespace-nowrap text-zinc-400">{row[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const tooltipStyle = { backgroundColor: '#000', borderRadius: '8px', border: '1px solid #333', color: '#fff', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' };
    const commonProps = { margin: { top: 20, right: 30, left: 0, bottom: 20 } };

    switch (type) {
      case 'bar':
        return (
          <BarChart data={data} {...commonProps} onClick={(e) => e?.activePayload && handleDataClick(e.activePayload[0].payload)}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2a2a2a" />
            <XAxis dataKey={config.xAxis} axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#555'}} />
            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#555'}} />
            <Tooltip cursor={{fill: 'rgba(229, 9, 20, 0.05)'}} contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={36} />
            {config.keys?.map((key, i) => (
              <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[2, 2, 0, 0]} barSize={32} />
            ))}
            <Brush dataKey={config.xAxis} height={30} stroke="#E50914" fill="#000" />
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data} {...commonProps} onClick={(e) => e?.activePayload && handleDataClick(e.activePayload[0].payload)}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2a2a2a" />
            <XAxis dataKey={config.xAxis} axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#555'}} />
            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#555'}} />
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={36} />
            {config.keys?.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={{r: 4, strokeWidth: 0}} activeDot={{r: 6}} />
            ))}
            <Brush dataKey={config.xAxis} height={30} stroke="#E50914" fill="#000" />
          </LineChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie data={data} innerRadius={75} outerRadius={105} paddingAngle={4} dataKey="value" nameKey="label" stroke="none" onClick={handleDataClick}>
              {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="bottom" height={36} />
          </PieChart>
        );
      case 'scatter':
        return (
          <ScatterChart {...commonProps} onClick={(e) => e?.activePayload && handleDataClick(e.activePayload[0].payload)}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2a2a2a" />
            <XAxis type="number" dataKey={config.xAxis} name={config.xAxis} axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#555'}} />
            <YAxis type="number" dataKey={config.yAxis} name={config.yAxis} axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#555'}} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={36} />
            <Scatter name="Data Points" data={data} fill="#E50914" onClick={(e) => handleDataClick(e)} />
          </ScatterChart>
        );
      default:
        return <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-700"><RefreshCw className="animate-spin" size={32} /></div>;
    }
  };

  return (
    <div ref={containerRef} className="mt-6 w-full h-[520px] bg-[#181818] border border-zinc-800 rounded-lg p-8 shadow-2xl relative animate-in fade-in duration-700 group">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-lg font-extrabold text-white tracking-tight uppercase border-l-4 border-[#E50914] pl-4">{title}</h3>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[3px] pl-5 italic opacity-50 flex items-center gap-1.5">
            <MousePointer2 size={10} /> Click a data point to drill down
          </p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 text-zinc-500 hover:text-white rounded-lg transition-all text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95"><Download size={14} /> <span>Save Analysis</span></button>
      </div>
      <div className="w-full h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          {renderContent()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
