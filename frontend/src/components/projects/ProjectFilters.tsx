"use client";

export type Filters = {
  search: string;
  status: string;
  causes: string[];
  skills: string[];
};

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function ProjectFilters({
  filters,
  onChange,
  causeOptions,
  skillOptions,
  canUseMyInterests,
  useMyInterests,
  onToggleUseMyInterests,
  savedInterests,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  causeOptions: string[];
  skillOptions: string[];
  canUseMyInterests: boolean;
  useMyInterests: boolean;
  onToggleUseMyInterests: () => void;
  savedInterests: string[];
}) {
  const hasFilters = filters.search || filters.status !== "Active" || filters.causes.length > 0 || filters.skills.length > 0;

  return (
    <div className="space-y-8 rounded-xl border border-[#E2E8F0] bg-white p-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="search" className="block text-sm font-semibold text-[#092130]">
            Search Projects
          </label>
          {hasFilters && (
            <button
              type="button"
              onClick={() => onChange({ search: "", status: "Active", causes: [], skills: [] })}
              className="text-xs font-semibold text-[#114160] hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <input
          type="search"
          id="search"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Title, organization, skill..."
          className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
        />
      </div>

      <div>
        <label htmlFor="status" className="mb-2 block text-sm font-semibold text-[#092130]">
          Status
        </label>
        <select
          id="status"
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
          className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
        >
          <option value="Active">Active</option>
          <option value="">All statuses</option>
          <option value="Draft">Draft</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      {causeOptions.length > 0 && (
        <CheckboxGroup
          title="Interests / Cause Areas"
          options={causeOptions}
          selected={filters.causes}
          onToggle={(cause) => onChange({ ...filters, causes: toggle(filters.causes, cause) })}
          footer={canUseMyInterests ? (
            <div className="pt-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={useMyInterests}
                  disabled={savedInterests.length === 0}
                  onChange={onToggleUseMyInterests}
                  className="mt-0.5 h-4 w-4 rounded border-[#CBD5E1] text-[#114160] focus:ring-[#114160] disabled:cursor-not-allowed disabled:opacity-60"
                />
                <span className="text-xs text-[#475569]">
                  {savedInterests.length > 0
                    ? "Use my interests"
                    : "Add interests in your profile, then return to use them here."}
                </span>
              </label>
            </div>
          ) : null}
        />
      )}

      {skillOptions.length > 0 && (
        <CheckboxGroup
          title="Skills Needed"
          options={skillOptions}
          selected={filters.skills}
          onToggle={(skill) => onChange({ ...filters, skills: toggle(filters.skills, skill) })}
        />
      )}
    </div>
  );
}

function CheckboxGroup({
  title,
  options,
  selected,
  onToggle,
  footer,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  footer?: JSX.Element | null;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-[#092130]">{title}</h3>
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {options.map((option) => (
          <label key={option} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onToggle(option)}
              className="h-4 w-4 rounded border-[#CBD5E1] text-[#114160] focus:ring-[#114160]"
            />
            <span className="text-sm text-[#475569] hover:text-[#0F172A]">{option}</span>
          </label>
        ))}
      </div>
      {footer}
    </div>
  );
}
