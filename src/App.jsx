import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [applicants, setApplicants] = useState([
    {
      id: 1,
      name: "Aarav Sharma",
      project: "Community Outreach",
      email: "aarav.sharma@email.com",
      answers: [
        { q: "Why are you interested in volunteering with the Human Service Forum?", a: "I’m deeply passionate about community building and have seen firsthand how small acts of service create lasting impact. The Community Outreach project aligns perfectly with my experience organizing local events." },
        { q: "What relevant skills or experience do you bring?", a: "Event planning (3+ years), public speaking, and strong interpersonal skills. I previously coordinated a food drive that served 400 families." }
      ],
      resume: "Aarav_Sharma_Resume.pdf"
    },
    {
      id: 2,
      name: "Maya Patel",
      project: "Nonprofit Analytics",
      email: "maya.patel@email.com",
      answers: [
        { q: "Why are you interested in volunteering with the Human Service Forum?", a: "Data drives meaningful change. I want to help nonprofits like HSF make evidence-based decisions that maximize their impact on the communities they serve." },
        { q: "What relevant skills or experience do you bring?", a: "Proficiency in Python, SQL, Tableau, and Google Analytics. I’ve built dashboards for two local nonprofits that increased funding efficiency by 34%." }
      ],
      resume: "Maya_Patel_Resume.pdf"
    },
    {
      id: 3,
      name: "Daniel Kim",
      project: "Volunteer Platform",
      email: "daniel.kim@email.com",
      answers: [
        { q: "Why are you interested in volunteering with the Human Service Forum?", a: "I love building tools that connect people with causes they care about. The Volunteer Platform project feels like the perfect intersection of technology and social good." },
        { q: "What relevant skills or experience do you bring?", a: "Full-stack developer with React, Node.js, and Firebase experience. I built a volunteer matching app for my university that now serves 1,200 students." }
      ],
      resume: "Daniel_Kim_Resume.pdf"
    },
    {
      id: 4,
      name: "Priya Patel",
      project: "Community Outreach",
      email: "priya.patel@email.com",
      answers: [
        { q: "Why are you interested in volunteering with the Human Service Forum?", a: "Growing up in a multicultural community taught me the power of connection. I’m excited to help HSF expand outreach to underserved neighborhoods." },
        { q: "What relevant skills or experience do you bring?", a: "Bilingual (English + Hindi), graphic design, and 4 years of social media management for nonprofits." }
      ],
      resume: "Priya_Patel_Resume.pdf"
    }
  ]);

  const [selected, setSelected] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredApplicants = applicants.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectApplicant = (applicant) => setSelected(applicant);

  const removeApplicant = (id) => {
    setApplicants(prev => prev.filter(a => a.id !== id));
    setSelected(null); // close details after action
  };

  const downloadResume = () => {
    if (!selected) return;
    alert(`✅ Downloading ${selected.resume}...\n\n(Real PDF download coming soon)`);
  };

  const approveApplicant = () => {
    if (!selected) return;
    alert(`🎉 ${selected.name} has been APPROVED for ${selected.project}!`);
    removeApplicant(selected.id);
  };

  const rejectApplicant = () => {
    if (!selected) return;
    if (confirm(`Reject ${selected.name}?`)) {
      alert(`❌ ${selected.name} has been REJECTED.`);
      removeApplicant(selected.id);
    }
  };

  useEffect(() => {
    console.log('%c✅ HSF Applicant Review Dashboard ready!', 'color:#4A0E99; font-size:16px; font-weight:700');
  }, []);

  return (
    <div className="dashboard w-screen min-h-screen">
      <header>
        <div className="logo">
          <img 
            src="/hsf-logo.png" 
            alt="Human Service Forum" 
            className="hsf-logo"
          />
        </div>

        <div className="flex-1" />
        <h1>Applicant Review Dashboard</h1>
        <div className="flex-1 text-right text-sm text-gray-600">
          Nonprofit Portal • Amherst, MA
        </div>
      </header>


      <div className="main">
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>Applicants <span className="count">({filteredApplicants.length})</span></h2>
          </div>

          <input
            type="text"
            className="search"
            placeholder="Search applicants or projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <div className="applicant-list">
            {filteredApplicants.map(applicant => (
              <div
                key={applicant.id}
                className={`applicant-card ${selected?.id === applicant.id ? 'selected' : ''}`}
                onClick={() => selectApplicant(applicant)}
              >
                <div className="applicant-name">{applicant.name}</div>
                <div className="applicant-project">{applicant.project}</div>
                <div className="text-xs text-gray-500 mt-3">{applicant.email}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="details-panel">
          {!selected ? (
            <div className="empty-state">
              <div>
                <div className="text-8xl mb-6 opacity-20">👋</div>
                <h3>Select an applicant</h3>
                <p className="max-w-xs mx-auto mt-4">
                  Click on any name from the list to view their short answers and download their resume.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="details-header">
                <div>
                  <div className="details-name">{selected.name}</div>
                  <div className="details-project">{selected.project}</div>
                  <div className="text-gray-600 mt-2">{selected.email}</div>
                </div>
                <div className="mini-cube">HSF</div>
              </div>

              <div className="section">
                <div className="section-title">Short Answers</div>
                {selected.answers.map((answer, i) => (
                  <div key={i} className="answer">
                    <div className="answer-question">{answer.q}</div>
                    <p>{answer.a}</p>
                  </div>
                ))}
              </div>

              <button onClick={downloadResume} className="download-btn w-full justify-center text-lg py-5">
                📄 Download Resume ({selected.resume})
              </button>
            </>
          )}
        </div>
      </div>

      {selected && (
        <div className="action-bar">
          <button onClick={approveApplicant} className="btn btn-approve">✅ Approve</button>
          <button onClick={rejectApplicant} className="btn btn-reject">✕ Reject</button>
          <button onClick={downloadResume} className="download-btn ml-5">
            📄 Download Resume
          </button>
        </div>
      )}
    </div>
  );
}

export default App;