export const SOURCES = [
  { id: "fat", name: "Find a Tender", url: "https://www.find-tender.service.gov.uk/Search/Results?&searchTerms=enterprise+resource+planning&status=live", sector: "Public", type: "Official Portal", desc: "UK Gov mandatory portal for above-threshold procurements", badge: "🏛️ Official", color: "#0052cc" },
  { id: "cf", name: "Contracts Finder", url: "https://www.contractsfinder.service.gov.uk/Search?keywords=ERP", sector: "Public", type: "Official Portal", desc: "Below-threshold & awarded contracts across all UK public bodies", badge: "🏛️ Official", color: "#0052cc" },
  { id: "bs", name: "BidStats UK", url: "https://bidstats.uk/tenders/?q=enterprise+resource+planning", sector: "Public", type: "Aggregator", desc: "Free aggregator — 35+ ERP notices in the past year", badge: "🔍 Free", color: "#00875a" },
  { id: "pcs", name: "Public Contracts Scotland", url: "https://www.publiccontractsscotland.gov.uk/search/Search_MainPage.aspx", sector: "Public", type: "Regional", desc: "Scottish public sector procurement portal", badge: "🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland", color: "#1d4ed8" },
  { id: "s2w", name: "Sell2Wales", url: "https://www.sell2wales.gov.wales/search/search_mainpage.aspx", sector: "Public", type: "Regional", desc: "Welsh government procurement portal", badge: "🏴󠁧󠁢󠁷󠁬󠁳󠁿 Wales", color: "#1d4ed8" },
  { id: "etni", name: "eTendersNI", url: "https://etendersni.gov.uk/epps", sector: "Public", type: "Regional", desc: "Northern Ireland public procurement portal", badge: "🇬🇧 NI", color: "#1d4ed8" },
  { id: "delta", name: "Delta eSourcing", url: "https://www.delta-esourcing.com/delta/listActiveTenders.html", sector: "Public", type: "eProcurement", desc: "Used widely by councils, NHS trusts & housing associations", badge: "📋 eTender", color: "#7c3aed" },
  { id: "nhs", name: "NHS eProcurement", url: "https://www.supply2health.nhs.uk/", sector: "Public", type: "Sector", desc: "Health sector ERP and digital transformation contracts", badge: "🏥 NHS", color: "#dc2626" },
  { id: "intend", name: "In-Tend", url: "https://www.in-tend.co.uk/", sector: "Public", type: "eProcurement", desc: "Housing associations, councils, further education", badge: "📋 eTender", color: "#7c3aed" },
  { id: "td", name: "Tenders Direct", url: "https://www.tendersdirect.co.uk/", sector: "Both", type: "Paid Aggregator", desc: "Comprehensive paid alert service, very thorough coverage", badge: "💼 Paid", color: "#b45309" },
  { id: "li", name: "LinkedIn", url: "https://www.linkedin.com/search/results/content/?keywords=ERP%20selection%20UK%20RFP&datePosted=past-week", sector: "Private", type: "Social Signal", desc: "Posts about ERP selection, digital transformation, RFP launches", badge: "🔗 Social", color: "#0077b5" },
  { id: "reg", name: "The Register", url: "https://www.theregister.com/search/?q=ERP+UK", sector: "Private", type: "Press", desc: "UK tech press covering major ERP wins and public sector deals", badge: "📰 Press", color: "#6b7280" },
];

export const LIVE_TENDERS_INITIAL = [
  { id: 1, org: "Warwickshire County Council", title: "Unit4 ERP Re-procurement (ERP + FP&A + Success4U)", sector: "Local Gov", published: "19 Feb 2026", status: "Active", url: "https://www.find-tender.service.gov.uk/procurement/ocds-h6vhtk-05f339", value: "TBC", notes: "Includes HeyCentric. Multiple notice stages published.", deadline: "", isCustom: false },
  { id: 2, org: "UK Parliament", title: "Pre-Market Engagement for Parliament ERP (Finance & Procurement)", sector: "Central Gov", published: "18 Dec 2025", status: "Pre-Market", url: "https://www.find-tender.service.gov.uk/Notice/084542-2025", value: "TBC", notes: "Cloud ERP for Finance & Procurement. HR/Payroll separate later.", deadline: "", isCustom: false },
  { id: 3, org: "Council (Unit4 Cloud Migration)", title: "Legacy Unit4 Business World Data Archiving Solution", sector: "Local Gov", published: "Early 2026", status: "Pre-Market", url: "https://www.find-tender.service.gov.uk/Notice/016866-2026", value: "TBC", notes: "Transitioning to Unit4 ERP Cloud — legacy data access needed.", deadline: "", isCustom: false },
  { id: 4, org: "Sellafield Ltd", title: "ICT Infrastructure & Application Management (SAP ERP in scope)", sector: "Nuclear / Gov", published: "Mar 2026", status: "Active", url: "https://www.find-tender.service.gov.uk/Notice/018199-2026", value: "£76.1M", notes: "118 apps including SAP ERP. 7-year contract under TS4 framework.", deadline: "", isCustom: false },
  { id: 5, org: "Hull City Council", title: "Cloud-based ERP Solution — Software & Implementation", sector: "Local Gov", published: "2024", status: "ITT Stage", url: "https://www.find-tender.service.gov.uk/Notice/032897-2024", value: "£3.7M+", notes: "7yr software (£700k/yr) + £3M implementation. CCS RM6194 framework.", deadline: "", isCustom: false },
  { id: 6, org: "VMIC UK", title: "ERP System for Manufacturing, Warehousing, Finance & HR", sector: "Life Sciences", published: "2024", status: "Closed", url: "https://www.contractsfinder.service.gov.uk/Notice/cbfda6dd-2270-4db7-9c73-045d00084385", value: "TBC", notes: "Vaccine Manufacturing Innovation Centre. 3yr + 2x12m extension.", deadline: "", isCustom: false },
];

export const SEARCH_QUERIES = [
  { label: "Find a Tender — ERP live", url: "https://www.find-tender.service.gov.uk/Search/Results?&searchTerms=enterprise+resource+planning&status=live" },
  { label: "Find a Tender — Pre-market ERP", url: "https://www.find-tender.service.gov.uk/Search/Results?&searchTerms=enterprise+resource+planning&NoticeType=UK2" },
  { label: "BidStats ERP contracts", url: "https://bidstats.uk/tenders/?q=enterprise+resource+planning" },
  { label: "Contracts Finder — ERP", url: "https://www.contractsfinder.service.gov.uk/Search?keywords=ERP+enterprise+resource+planning" },
  { label: "LinkedIn — UK ERP RFP this week", url: "https://www.linkedin.com/search/results/content/?keywords=ERP%20selection%20UK%20RFP&datePosted=past-week" },
];

export const FRAMEWORKS = [
  { id: "ccs_rm6194", name: "CCS RM6194", fullName: "Crown Commercial Service — Back Office Software", desc: "Mandatory framework for ERP/HR/Finance software. Required for most public sector bids above threshold. Hull City Council used this.", priority: "High", url: "https://www.crowncommercial.gov.uk/agreements/RM6194" },
  { id: "gcloud", name: "G-Cloud 14", fullName: "Crown Commercial Service — G-Cloud 14", desc: "Fast route to market for cloud software & services. Open to all public bodies. No competitive tender required.", priority: "High", url: "https://www.crowncommercial.gov.uk/agreements/RM1557.14" },
  { id: "nhs_sbs", name: "NHS SBS", fullName: "NHS Shared Business Services", desc: "Health sector ERP, finance & digital transformation procurement framework.", priority: "Medium", url: "https://www.sbs.nhs.uk/proc-framework-agreements-support" },
  { id: "ypo", name: "YPO ICT", fullName: "YPO — ICT Managed Services & Digital Transformation", desc: "Used by councils and schools for technology procurement including ERP systems.", priority: "Medium", url: "https://www.ypo.co.uk/frameworks" },
  { id: "lga", name: "LGA", fullName: "Local Government Association Frameworks", desc: "Council-specific routes to market for ERP and back-office solutions.", priority: "Medium", url: "https://www.local.gov.uk/our-support/procurement" },
  { id: "ts4", name: "TS4", fullName: "Technology Solutions 4 (NDA)", desc: "Nuclear Decommissioning Authority framework. Used by Sellafield for their £76.1M SAP ERP contract.", priority: "Low", url: "https://www.nda.gov.uk/procurement/" },
];

export const STATUS_COLORS = {
  Active: { bg: "#dcfce7", text: "#166534", dot: "#16a34a" },
  "Pre-Market": { bg: "#fef9c3", text: "#854d0e", dot: "#ca8a04" },
  "ITT Stage": { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
  Closed: { bg: "#f1f5f9", text: "#64748b", dot: "#94a3b8" },
};

export const SECTOR_COLORS = {
  "Local Gov": "#7c3aed",
  "Central Gov": "#0052cc",
  "Nuclear / Gov": "#dc2626",
  "Life Sciences": "#059669",
  NHS: "#dc2626",
  Housing: "#0891b2",
  Education: "#7c3aed",
  Other: "#475569",
};

export const PIPELINE_STAGES = [
  { id: "watching", label: "Watching", icon: "👀", color: "#475569", bg: "rgba(71,85,105,0.15)" },
  { id: "interested", label: "Interested", icon: "⭐", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  { id: "submitted", label: "Submitted", icon: "📤", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
  { id: "won", label: "Won", icon: "✅", color: "#16a34a", bg: "rgba(22,163,74,0.15)" },
  { id: "lost", label: "Lost", icon: "💔", color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
  { id: "no_bid", label: "No Bid", icon: "🚫", color: "#64748b", bg: "rgba(100,116,139,0.15)" },
];

export const SECTORS = ["Local Gov", "Central Gov", "Nuclear / Gov", "Life Sciences", "NHS", "Housing", "Education", "Other"];
export const STATUSES = ["Active", "Pre-Market", "ITT Stage", "Closed"];

export const CPV_CODES = [
  { code: "48400000", label: "Business transaction & personal business software" },
  { code: "48000000", label: "Software package and information systems" },
  { code: "72200000", label: "Software programming and consultancy" },
  { code: "72250000", label: "System and support services" },
  { code: "72600000", label: "Computer support and consultancy services" },
  { code: "48100000", label: "Industry specific software package" },
];

export const STRATEGY_CARDS = [
  { icon: "🏛️", color: "#6366f1", title: "Public Sector — Official Portals", steps: ["Register on find-tender.service.gov.uk (free GOV.UK One Login)", "Set saved search: keyword 'enterprise resource planning', status 'live'", "Enable email alerts — get notified of new notices automatically", "Also watch UK2 notices (Pre-Market Engagement) — these signal tenders 3–6 months out", "Check CPV code 48400000 for broader software procurement coverage"] },
  { icon: "🔍", color: "#0ea5e9", title: "Spot Early-Stage Intent", steps: ["Watch for 'Prior Information Notices' and 'Market Engagement' notices — precede formal tenders", "Monitor Companies House for newly incorporated subsidiaries — often trigger ERP needs", "Google Alerts: 'ERP' + 'UK' + 'tender' OR 'RFP' OR 'procurement' (weekly digest)", "Follow ERP consultants on LinkedIn — they post about mandates before clients do", "Watch for council budget announcements — digital transformation spend = ERP signals"] },
  { icon: "💼", color: "#f59e0b", title: "Private Sector Signals", steps: ["LinkedIn: search 'ERP selection UK' filtered to last week, follow digital directors", "The Register & Computing.co.uk: subscribe to UK enterprise tech news", "Trade press by vertical: healthcare IT, manufacturing tech, logistics/supply chain", "M&A activity = near-certain ERP replacement need; monitor Mergermarket", "PE-backed companies (post-buyout, 1–3 years) often standardise on new ERP"] },
  { icon: "📨", color: "#10b981", title: "Outreach Approach", steps: ["Target IT Directors, CFOs, and Digital Transformation leads — key decision-makers", "Reference the tender/notice by number when reaching out — shows you're informed", "Offer a discovery call framed around 'business case support' not 'sales'", "For Pre-Market stage: respond to questionnaires proactively — shape the spec", "Framework agreements (CCS RM6194) give you pre-approval to bid — register early"] },
  { icon: "📋", color: "#ec4899", title: "Key Frameworks to Register On", steps: ["CCS RM6194 — Crown Commercial Service Back Office Software (ERP/HR/Finance)", "CCS G-Cloud — cloud software and services for all public bodies", "NHS Shared Business Services — health sector ERP and IT", "YPO — ICT Managed Services & Digital Transformation", "Local Government Association frameworks — council-specific routes to market"] },
  { icon: "⚡", color: "#8b5cf6", title: "Weekly Monitoring Routine", steps: ["Mon: Check Find a Tender saved search results (new ERP notices)", "Tue: Review BidStats and Contracts Finder for below-threshold notices", "Wed: LinkedIn scan for UK digital transformation & ERP posts", "Thu: Check regional portals (Scotland, Wales, NI) if relevant", "Fri: Read The Register and Computing for sector news & ERP project announcements"] },
];
