"use client";

import { useState } from "react";

export default function ProjectFilters() {
  const [search, setSearch] = useState("");

  const causes = ["Education", "Health", "Environment", "Community", "Technology"];
  const skills = ["Marketing", "Web Development", "Design", "Data Analysis", "Writing"];
  const timeCommitments = ["1-5 hours/week", "5-10 hours/week", "10+ hours/week"];

  return (
    <div className="space-y-8 rounded-xl border border-[#E2E8F0] bg-white p-6">
      {/* Search */}
      <div>
        <label htmlFor="search" className="mb-2 block text-sm font-semibold text-[#092130]">
          Search Projects
        </label>
        <input
          type="text"
          id="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Keywords..."
          className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
        />
      </div>

      {/* Causes */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-[#092130]">Cause Areas</h3>
        <div className="space-y-2">
          {causes.map((cause) => (
            <label key={cause} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#CBD5E1] text-[#114160] focus:ring-[#114160]"
              />
              <span className="text-sm text-[#475569] hover:text-[#0F172A]">{cause}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Skills */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-[#092130]">Skills Needed</h3>
        <div className="space-y-2">
          {skills.map((skill) => (
            <label key={skill} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#CBD5E1] text-[#114160] focus:ring-[#114160]"
              />
              <span className="text-sm text-[#475569] hover:text-[#0F172A]">{skill}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Time Commitment */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-[#092130]">Time Commitment</h3>
        <div className="space-y-2">
          {timeCommitments.map((time) => (
            <label key={time} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="time"
                className="h-4 w-4 border-[#CBD5E1] text-[#114160] focus:ring-[#114160]"
              />
              <span className="text-sm text-[#475569] hover:text-[#0F172A]">{time}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
