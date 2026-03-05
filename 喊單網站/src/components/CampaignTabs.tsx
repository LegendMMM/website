import { motion } from "framer-motion";
import type { Campaign } from "../types/domain";

interface CampaignTabsProps {
  campaigns: Campaign[];
  activeCampaignId: string;
  onChange: (campaignId: string) => void;
}

export function CampaignTabs({ campaigns, activeCampaignId, onChange }: CampaignTabsProps): JSX.Element {
  return (
    <div className="flex flex-wrap gap-3">
      {campaigns.map((campaign) => {
        const active = campaign.id === activeCampaignId;
        return (
          <button
            key={campaign.id}
            onClick={() => onChange(campaign.id)}
            className={`relative overflow-hidden rounded-xl border px-4 py-2 text-sm font-semibold transition ${
              active
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
            }`}
            type="button"
          >
            {active && (
              <motion.span
                layoutId="active-campaign"
                className="absolute inset-0 -z-10 bg-slate-900"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            {campaign.title}
          </button>
        );
      })}
    </div>
  );
}
