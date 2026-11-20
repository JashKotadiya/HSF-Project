"use client";

import { stringList, useCauseCategories } from "@/lib/interests";

// Project cause picker backed by the shared cause/interest list that volunteers
// choose from on their profiles. A saved cause that is not (yet) in the shared
// list stays selectable so existing projects keep their category.
export default function CauseSelect({ id, value, onChange }: { id: string; value: string; onChange: (cause: string) => void }) {
  const categories = useCauseCategories();
  const current = value.trim();
  const options = stringList([...categories.categories, current]);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-[#092130]">
        Cause / Interest Area
      </label>
      <select
        id={id}
        value={current}
        onChange={(event) => onChange(event.target.value)}
        disabled={categories.loading}
        aria-describedby={`${id}-help`}
        className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160] disabled:opacity-60"
      >
        <option value="">{categories.loading ? "Loading causes..." : "No cause selected"}</option>
        {options.map((cause) => (
          <option key={cause} value={cause}>{cause}</option>
        ))}
      </select>
      <p id={`${id}-help`} className="mt-1 text-xs text-[#64748B]">
        Volunteers find projects by matching their interests to this cause. Technical skills are listed separately below.
      </p>
      {categories.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          Couldn&apos;t load the cause list.
          <button type="button" onClick={categories.retry} className="ml-2 underline">Retry causes</button>
        </p>
      )}
    </div>
  );
}
