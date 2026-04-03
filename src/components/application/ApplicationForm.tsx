

"use client";

import { ChangeEvent, FormEvent, useState } from "react";

const questions = [
  "Why are you interested in this project?",
  "What relevant experience do you have?",
  "What is your availability over the next few weeks?",
];

export default function ApplicationForm() {
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleAnswerChange = (index: number, value: string) => {
    const updated = [...answers];
    updated[index] = value;
    setAnswers(updated);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setResume(file);
  };

  const validateForm = () => {
    const newErrors: string[] = [];

    answers.forEach((answer, index) => {
      if (!answer.trim()) {
        newErrors.push(`Please answer question ${index + 1}.`);
      }
    });

    if (!resume) {
      newErrors.push("Please upload your resume.");
    }

    return newErrors;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setSuccessMessage("");
      return;
    }

    setErrors([]);
    setIsSubmitting(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setSuccessMessage("Application submitted successfully.");
      setAnswers(questions.map(() => ""));
      setResume(null);
    } catch {
      setErrors(["Something went wrong while submitting your application."]);
      setSuccessMessage("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="rounded-xl border border-[#E2E8F0] bg-white">
        <div className="border-b border-[#E2E8F0] px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">
            PROJECT SUMMARY
          </p>
          <h2 className="mt-2 text-2xl font-bold text-[#092130]">
            Volunteer Management Dashboard
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#0F172A]">
            Support a nonprofit organization by helping build a dashboard for
            volunteer coordination and management.
          </p>

          
        </div>

        <div className="space-y-6 px-6 py-6">
          {questions.map((question, index) => (
            <div key={question} className="space-y-2">
              <label className="block text-sm font-semibold text-[#092130]">
                {question}
              </label>

              <textarea
                value={answers[index]}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                rows={5}
                className="w-full resize-none rounded-md border border-[#CBD5E1] bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-2 focus:ring-[#D3E6F2]"
                placeholder="Type your response here..."
              />
            </div>
          ))}

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-[#092130]">
              Upload Resume
            </label>

            <div className="rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    {resume ? resume.name : "No file selected"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Accepted formats: PDF, DOC, DOCX</p>
                </div>

                <label className="rounded-md border border-[#114160] bg-white px-4 py-2 text-sm font-medium text-[#114160] hover:bg-[#D3E6F2] transition inline-flex cursor-pointer items-center">
                  Choose File
                  <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <ul className="space-y-1 text-sm text-red-700">
            {errors.map((error) => (
              <li key={error}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {successMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={isSubmitting} className="rounded-md bg-[#114160] px-6 py-3 text-sm font-semibold text-white hover:bg-[#092130] transition">
          {isSubmitting ? "Submitting..." : "Submit Application"}
        </button>
      </div>
    </form>
  );
}