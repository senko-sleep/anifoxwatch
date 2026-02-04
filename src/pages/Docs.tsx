import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_DOCS_MARKDOWN } from '@/data/api-docs';
import {
    ChevronRight, Menu, X, Book, Terminal, Globe, Code,
    Shield, Zap, Hash, Activity, Clock, Server, Layers,
    Search as SearchIcon, ExternalLink, ChevronDown, CheckCircle2,
    AlertCircle, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/Logo';
import { Link } from 'react-router-dom';
import { docsClient, type ApiDocs, type ApiHealth } from '@/lib/docs-client';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const Docs = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [docs, setDocs] = useState<ApiDocs | null>(docsClient.getCachedDocs());
    const [health, setHealth] = useState<ApiHealth | null>(docsClient.getCachedHealth());
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'guide' | 'reference'>(docsClient.getPrefs().lastTab);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        docsClient.savePrefs({ lastTab: activeTab });
    }, [activeTab]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [docsData, healthData] = await Promise.all([
                    docsClient.getDocs(),
                    docsClient.getHealth()
                ]);
                setDocs(docsData);
                setHealth(healthData);
            } catch (error) {
                console.error('Failed to sync with API:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        // Poll health every 30 seconds
        const interval = setInterval(async () => {
            try {
                const healthData = await docsClient.getHealth();
                setHealth(healthData);
            } catch (e) { }
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    const scrollToId = (id: string) => {
        const element = document.getElementById(id);
        if (element) {
            const offset = 80;
            const bodyRect = document.body.getBoundingClientRect().top;
            const elementRect = element.getBoundingClientRect().top;
            const elementPosition = elementRect - bodyRect;
            const offsetPosition = elementPosition - offset;

            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
            setIsSidebarOpen(false);
        }
    };

    const statusColor = useMemo(() => {
        if (!health) return 'text-muted-foreground';
        return health.status === 'healthy' ? 'text-emerald-400' : 'text-rose-400';
    }, [health]);

    const uptimeStr = useMemo(() => {
        if (!health) return '0s';
        const seconds = Math.floor(health.uptime);
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}h ${m}m ${s}s`;
    }, [health]);

    return (
        <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] selection:bg-fox-orange/30 font-sans">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b border-[#30363d] bg-[#0d1117]/80 backdrop-blur-md">
                <div className="px-4 md:px-6 flex h-16 items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="md:hidden text-[#8b949e]"
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        >
                            <Menu className="h-5 w-5" />
                        </Button>
                        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                            <Logo size="sm" />
                            <div className="h-6 w-[1px] bg-[#30363d] hidden sm:block" />
                            <span className="hidden sm:inline-block text-sm font-semibold text-[#f0f6fc] tracking-tight">
                                Developer Documentation
                            </span>
                        </Link>
                    </div>

                    <div className="flex items-center gap-4 md:gap-6">
                        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#161b22] border border-[#30363d] text-[11px] font-medium">
                            <span className={cn("relative flex h-2 w-2", health?.status === 'healthy' ? "animate-pulse" : "")}>
                                <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", health?.status === 'healthy' ? "bg-emerald-500" : "bg-rose-500")}></span>
                                <span className={cn("relative inline-flex rounded-full h-2 w-2", health?.status === 'healthy' ? "bg-emerald-500" : "bg-rose-500")}></span>
                            </span>
                            <span className="text-[#8b949e]">API Status:</span>
                            <span className={statusColor}>{health?.status || 'Offline'}</span>
                            <span className="text-[#30363d]">|</span>
                            <span className="text-[#8b949e]">v{docs?.version || '1.0.0'}</span>
                        </div>

                        <div className="relative group hidden sm:block">
                            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                                <SearchIcon className="h-4 w-4 text-[#8b949e]" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search documentation..."
                                className="w-48 md:w-64 bg-[#161b22] border border-[#30363d] rounded-md py-1.5 pl-10 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-fox-orange/50 focus:border-fox-orange/50 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <kbd className="absolute right-3 top-2 hidden md:inline-flex h-5 select-none items-center gap-1 rounded border border-[#30363d] bg-[#0d1117] px-1.5 font-mono text-[10px] font-medium text-[#8b949e] opacity-100">
                                <span className="text-xs">⌘</span>K
                            </kbd>
                        </div>

                        <Link to="/">
                            <Button variant="ghost" size="sm" className="text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#1f242c]">
                                Return to Site
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            <div className="flex">
                {/* Sidebar */}
                <aside
                    className={cn(
                        "fixed inset-y-0 left-0 z-40 w-72 border-r border-[#30363d] bg-[#0d1117] transition-transform md:translate-x-0 md:sticky md:top-16 md:h-[calc(100vh-4rem)]",
                        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                    )}
                >
                    <div className="flex flex-col h-full py-6">
                        <div className="px-6 mb-8 flex gap-2">
                            <button
                                onClick={() => setActiveTab('guide')}
                                className={cn(
                                    "flex-1 py-1.5 text-xs font-semibold rounded-md border transition-all",
                                    activeTab === 'guide'
                                        ? "bg-[#1f242c] border-fox-orange/50 text-fox-orange"
                                        : "bg-transparent border-transparent text-[#8b949e] hover:text-[#f0f6fc]"
                                )}
                            >
                                Guide
                            </button>
                            <button
                                onClick={() => setActiveTab('reference')}
                                className={cn(
                                    "flex-1 py-1.5 text-xs font-semibold rounded-md border transition-all",
                                    activeTab === 'reference'
                                        ? "bg-[#1f242c] border-fox-orange/50 text-fox-orange"
                                        : "bg-transparent border-transparent text-[#8b949e] hover:text-[#f0f6fc]"
                                )}
                            >
                                Reference
                            </button>
                        </div>

                        <ScrollArea className="flex-1 px-4">
                            <div className="space-y-6">
                                {activeTab === 'guide' ? (
                                    <div className="space-y-4">
                                        <section>
                                            <h4 className="px-3 mb-2 text-xs font-bold uppercase tracking-wider text-[#8b949e]">Introduction</h4>
                                            <div className="space-y-1">
                                                <SidebarLink icon={<Book />} label="Overview" onClick={() => scrollToId('overview')} />
                                                <SidebarLink icon={<Zap />} label="Quick Start" onClick={() => scrollToId('quick-start')} />
                                                <SidebarLink icon={<Layers />} label="System Info" onClick={() => scrollToId('system-endpoints')} />
                                            </div>
                                        </section>
                                        <section>
                                            <h4 className="px-3 mb-2 text-xs font-bold uppercase tracking-wider text-[#8b949e]">Development</h4>
                                            <div className="space-y-1">
                                                <SidebarLink icon={<Code />} label="Authentication" onClick={() => { }} />
                                                <SidebarLink icon={<Activity />} label="Rate Limits" onClick={() => scrollToId('rate-limiting')} />
                                                <SidebarLink icon={<Shield />} label="CORS Policy" onClick={() => { }} />
                                            </div>
                                        </section>
                                    </div>
                                ) : (
                                    <div className="space-y-4 text-sm">
                                        {docs?.endpoints && Object.entries(docs.endpoints).map(([category, endpoints]) => (
                                            <section key={category}>
                                                <h4 className="px-3 mb-2 text-xs font-bold uppercase tracking-wider text-[#8b949e] capitalize">{category}</h4>
                                                <div className="space-y-1">
                                                    {Object.entries(endpoints).map(([name, route]) => (
                                                        <button
                                                            key={name}
                                                            className="group flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-[#161b22]"
                                                            onClick={() => scrollToId(`${category}-${name}`)}
                                                        >
                                                            <div className="mt-1 w-1.5 h-1.5 rounded-full bg-fox-orange/40 group-hover:bg-fox-orange shrink-0" />
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-[#f0f6fc] capitalize">{name.replace(/([A-Z])/g, ' $1').trim()}</span>
                                                                <span className="text-[11px] font-mono text-[#8b949e] leading-tight truncate">{route}</span>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </section>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </ScrollArea>

                        <div className="mt-auto px-6 pt-6 border-t border-[#30363d]">
                            <div className="p-3 rounded-lg bg-[#161b22] border border-[#30363d]">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-[#f0f6fc]">API Health</span>
                                    <ExternalLink className="h-3 w-3 text-[#8b949e]" />
                                </div>
                                <div className="space-y-1.5 text-[11px]">
                                    <div className="flex justify-between">
                                        <span className="text-[#8b949e]">Uptime:</span>
                                        <span className="text-[#c9d1d9]">{uptimeStr}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[#8b949e]">Latency:</span>
                                        <span className="text-emerald-400"> ~42ms</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-[#8b949e]">Environment:</span>
                                        <span className="text-fox-orange font-mono">dev-local</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Backdrop for mobile */}
                {isSidebarOpen && (
                    <div
                        className="fixed inset-0 z-30 bg-black/60 md:hidden"
                        onClick={() => setIsSidebarOpen(false)}
                    />
                )}

                {/* Main Content */}
                <main className="flex-1 min-w-0 py-10 px-4 md:px-10 lg:px-16 overflow-hidden">
                    <div className="max-w-4xl mx-auto">
                        {/* Breadcrumbs */}
                        <nav className="flex items-center gap-2 mb-8 text-sm text-[#8b949e]">
                            <Link to="/" className="hover:text-fox-orange transition-colors">Home</Link>
                            <ChevronRight className="h-4 w-4" />
                            <span className="text-[#f0f6fc] font-medium">Docs</span>
                            <ChevronRight className="h-4 w-4" />
                            <span className="capitalize">{activeTab}</span>
                        </nav>

                        <article className="prose prose-invert prose-orange max-w-none">
                            <section id="hero" className="mb-16">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fox-orange/10 border border-fox-orange/20 text-fox-orange text-xs font-bold mb-6">
                                    <Server className="h-3 w-3" />
                                    API VERSION {docs?.version || '1.0.0'}
                                </div>
                                <h1 className="text-5xl font-extrabold tracking-tight text-[#f0f6fc] mb-6">
                                    Build something <span className="text-transparent bg-clip-text bg-gradient-to-r from-fox-orange to-yellow-500">incredible</span>
                                </h1>
                                <p className="text-xl text-[#8b949e] leading-relaxed max-w-2xl">
                                    {docs?.description || 'The official API for AniFox. High-performance anime streaming, searching, and metadata discovery for developers.'}
                                </p>
                                <div className="flex flex-wrap gap-4 mt-8">
                                    <Button className="bg-fox-orange hover:bg-fox-orange/90 text-white font-bold" onClick={() => scrollToId('quick-start')}>
                                        Get Started
                                    </Button>
                                    <Button variant="outline" className="border-[#30363d] text-[#f0f6fc] hover:bg-[#161b22]" onClick={() => setActiveTab('reference')}>
                                        API Reference
                                    </Button>
                                </div>
                            </section>

                            <Separator className="bg-[#30363d] my-12" />

                            <div className={cn(activeTab !== 'guide' ? 'hidden' : 'block')}>
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        h2: ({ children }) => {
                                            const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                                            return (
                                                <h2 id={id} className="text-3xl font-bold text-[#f0f6fc] tracking-tight mt-16 mb-6 scroll-mt-24">
                                                    {children}
                                                </h2>
                                            );
                                        },
                                        h3: ({ children }) => {
                                            const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
                                            return (
                                                <h3 id={id} className="text-xl font-semibold text-[#f0f6fc] mt-10 mb-4 scroll-mt-24">
                                                    {children}
                                                </h3>
                                            );
                                        },
                                        p: ({ children }) => (
                                            <p className="text-[#8b949e] leading-7 mb-6 text-lg">
                                                {children}
                                            </p>
                                        ),
                                        pre: ({ children }) => (
                                            <div className="relative my-8 rounded-xl overflow-hidden bg-[#161b22] border border-[#30363d] shadow-2xl">
                                                <div className="flex items-center justify-between px-4 py-3 bg-[#0d1117] border-b border-[#30363d]">
                                                    <div className="flex gap-1.5">
                                                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                                                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                                                        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                                                    </div>
                                                    <span className="text-xs font-mono text-[#8b949e]">bash</span>
                                                </div>
                                                <pre className="p-6 m-0 overflow-x-auto text-[13px] font-mono leading-relaxed bg-transparent">
                                                    {children}
                                                </pre>
                                            </div>
                                        ),
                                        code: ({ node, className, children, ...props }) => {
                                            const match = /language-(\w+)/.exec(className || '');
                                            const inline = !match;
                                            if (inline) {
                                                return (
                                                    <code className="bg-[#1f242c] text-fox-orange px-1.5 py-0.5 rounded font-mono text-sm" {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            }
                                            return <code className={className} {...props}>{children}</code>;
                                        },
                                        ul: ({ children }) => <ul className="space-y-3 mb-8">{children}</ul>,
                                        li: ({ children }) => (
                                            <li className="flex items-start gap-3 text-[#c9d1d9]">
                                                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-1 shrink-0" />
                                                <span className="text-lg">{children}</span>
                                            </li>
                                        ),
                                        table: ({ children }) => (
                                            <div className="my-8 overflow-hidden rounded-xl border border-[#30363d]">
                                                <table className="w-full text-left border-collapse">
                                                    <thead className="bg-[#161b22] border-b border-[#30363d]">{children[0]}</thead>
                                                    <tbody className="divide-y divide-[#30363d]">{children[1]}</tbody>
                                                </table>
                                            </div>
                                        ),
                                        th: ({ children }) => <th className="px-6 py-4 font-bold text-[#f0f6fc] text-sm uppercase tracking-wider">{children}</th>,
                                        td: ({ children }) => <td className="px-6 py-4 text-[#8b949e] text-sm">{children}</td>
                                    }}
                                >
                                    {API_DOCS_MARKDOWN}
                                </ReactMarkdown>
                            </div>

                            {/* API Reference Dynamic Section */}
                            <div className={cn(activeTab !== 'reference' ? 'hidden' : 'block')}>
                                <h2 className="text-3xl font-bold text-[#f0f6fc] mb-8">Full API Reference</h2>
                                <div className="space-y-16">
                                    {docs?.endpoints && Object.entries(docs.endpoints).map(([category, endpoints]) => (
                                        <div key={category} id={category} className="scroll-mt-24">
                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="h-8 w-1 bg-fox-orange rounded-full" />
                                                <h3 className="text-2xl font-bold text-[#f0f6fc] capitalize">{category} Endpoints</h3>
                                            </div>
                                            <div className="grid gap-4">
                                                {Object.entries(endpoints).map(([name, route]) => {
                                                    const [method, path] = route.split(' ');
                                                    return (
                                                        <div
                                                            key={name}
                                                            id={`${category}-${name}`}
                                                            className="group p-6 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-fox-orange/30 transition-all scroll-mt-24"
                                                        >
                                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                                                                <div className="flex items-center gap-3">
                                                                    <Badge className={cn(
                                                                        "px-2.5 py-0.5 font-mono font-bold text-xs uppercase",
                                                                        method === 'GET' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                                                            method === 'POST' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                                                                "bg-[#30363d] text-[#8b949e]"
                                                                    )}>
                                                                        {method}
                                                                    </Badge>
                                                                    <h4 className="text-lg font-bold text-[#f0f6fc] capitalize">
                                                                        {name.replace(/([A-Z])/g, ' $1').trim()}
                                                                    </h4>
                                                                </div>
                                                                <div className="font-mono text-sm bg-[#0d1117] px-3 py-1.5 rounded-md border border-[#30363d] text-[#c9d1d9] overflow-x-auto">
                                                                    {path}
                                                                </div>
                                                            </div>
                                                            <p className="text-[#8b949e] mb-6">
                                                                Fetches {name.toLowerCase().replace(/-/g, ' ')} data from the active content sources.
                                                            </p>

                                                            <div className="flex items-center gap-6 text-[11px] font-bold tracking-widest uppercase text-[#8b949e]">
                                                                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Cache: 300s</span>
                                                                <span className="flex items-center gap-1.5"><Layers className="h-3 w-3" /> Rate Limit: 100/min</span>
                                                                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Stable</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}

                                    {docs?.availableSources && (
                                        <div id="sources" className="mt-16 bg-fox-orange/5 border border-fox-orange/20 rounded-2xl p-8">
                                            <div className="flex items-center gap-3 mb-6 font-bold text-fox-orange">
                                                <Globe className="h-6 w-6" />
                                                <h3 className="text-xl">Available Content Sources</h3>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {docs.availableSources.map(source => (
                                                    <div key={source} className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border border-fox-orange/10 rounded-lg text-sm text-[#f0f6fc]">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-fox-orange" />
                                                        {source}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </article>

                        {/* Footer Interaction */}
                        <div className="mt-24 pt-10 border-t border-[#30363d] flex flex-col md:flex-row justify-between items-center gap-8">
                            <div className="flex items-center gap-6">
                                <p className="text-sm text-[#8b949e]">© {new Date().getFullYear()} AniFox Engineering</p>
                                <div className="flex gap-4">
                                    <a href="#" className="text-[#8b949e] hover:text-fox-orange transition-colors"><X className="h-5 w-5" /></a>
                                    <a href="#" className="text-[#8b949e] hover:text-fox-orange transition-colors"><Globe className="h-5 w-5" /></a>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button className="text-sm text-[#8b949e] hover:text-[#f0f6fc] transition-colors">Privacy Policy</button>
                                <button className="text-sm text-[#8b949e] hover:text-[#f0f6fc] transition-colors">Status Page</button>
                                <button className="text-sm text-[#8b949e] hover:text-[#f0f6fc] transition-colors">Support</button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Dynamic Background */}
            <div className="fixed top-0 left-0 -z-10 h-screen w-screen overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-fox-orange/5 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[150px] rounded-full" />
            </div>
        </div>
    );
};

const SidebarLink = ({ icon, label, onClick, active }: { icon: React.ReactNode, label: string, onClick: () => void, active?: boolean }) => (
    <button
        onClick={onClick}
        className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[#161b22]",
            active ? "bg-[#1f242c] text-fox-orange" : "text-[#8b949e] hover:text-[#f0f6fc]"
        )}
    >
        {React.cloneElement(icon as React.ReactElement, { className: "h-4 w-4" })}
        {label}
    </button>
);

export default Docs;
