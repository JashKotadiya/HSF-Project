'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

// Dummy data from the provided zip
const initialApplicants = [
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
];

export default function ApplicantsDashboard() {
  const router = useRouter();
  const supabase = createClient();
  
  const [loading, setLoading] = useState(true);
  const [applicants, setApplicants] = useState(initialApplicants);
  const [selected, setSelected] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      if (session.user?.user_metadata?.role === 'volunteer') {
        router.push('/volunteer');
        return;
      }
      setLoading(false);
    };

    checkAuth();
  }, [router, supabase]);

  const filteredApplicants = applicants.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.project.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectApplicant = (applicant: any) => setSelected(applicant);

  const removeApplicant = (id: number) => {
    setApplicants(prev => prev.filter(a => a.id !== id));
    setSelected(null);
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

  if (loading) return <Box sx={{ p: 4 }}>Loading dashboard...</Box>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F1F5F9', display: 'flex', flexDirection: 'column' }}>
      
      {/* HEADER */}
      <Box sx={{ borderBottom: '1px solid #E2E8F0', bgcolor: '#FFFFFF', px: 4, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button component={Link} href="/dashboard" startIcon={<ArrowBackIcon />} sx={{ color: '#475569' }}>
            Back
          </Button>
          <Typography sx={{ fontWeight: 700, color: '#0F172A' }} variant="h5">
            Applicant Review Dashboard
          </Typography>
        </Box>
        <Typography sx={{ color: '#64748B' }} variant="body2">
          Nonprofit Portal • Amherst, MA
        </Typography>
      </Box>

      {/* MAIN CONTENT */}
      <Box sx={{ flexGrow: 1, p: 4, display: 'flex', overflow: 'hidden' }}>
        <Grid container spacing={4} sx={{ height: '100%' }}>
          
          {/* SIDEBAR */}
          <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
              <Typography sx={{ fontWeight: 700, mb: 2 }} variant="h6">
                Applicants <Typography sx={{ color: 'primary.main' }} component="span">({filteredApplicants.length})</Typography>
              </Typography>
              
              <TextField
                fullWidth
                size="small"
                placeholder="Search applicants or projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{ mb: 3 }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }
                }}
              />

              <Box sx={{ overflowY: 'auto', flexGrow: 1, mx: -2 }}>
                <List disablePadding>
                  {filteredApplicants.map(applicant => (
                    <ListItemButton 
                      key={applicant.id} 
                      selected={selected?.id === applicant.id}
                      onClick={() => selectApplicant(applicant)}
                      sx={{ 
                        borderLeft: selected?.id === applicant.id ? '4px solid #4A0E99' : '4px solid transparent',
                        bgcolor: selected?.id === applicant.id ? '#F8FAFC' : 'transparent',
                        px: 3,
                        py: 2,
                        mb: 1,
                        '&.Mui-selected': {
                          bgcolor: '#F8FAFC',
                          '&:hover': { bgcolor: '#F1F5F9' }
                        }
                      }}
                    >
                      <ListItemText 
                        primary={
                          <Typography sx={{ fontWeight: 600, color: '#0F172A' }} variant="subtitle2">
                            {applicant.name}
                          </Typography>
                        }
                        secondary={
                          <>
                            <Typography sx={{ display: 'block', fontWeight: 500, color: '#475569', mt: 0.5 }} variant="caption">
                              {applicant.project}
                            </Typography>
                            <Typography sx={{ display: 'block', color: '#94A3B8', mt: 0.5 }} variant="caption">
                              {applicant.email}
                            </Typography>
                          </>
                        }
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            </Paper>
          </Grid>

          {/* DETAILS PANEL */}
          <Grid size={{ xs: 12, md: 8 }} sx={{ height: '100%' }}>
            <Paper elevation={0} sx={{ p: 4, borderRadius: 3, border: '1px solid #E2E8F0', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              
              {!selected ? (
                <Box sx={{ m: 'auto', textAlign: 'center', color: '#94A3B8' }}>
                  <Typography variant="h1" sx={{ mb: 2, opacity: 0.5 }}>👋</Typography>
                  <Typography sx={{ fontWeight: 600, color: '#475569', mb: 1 }} variant="h5">
                    Select an applicant
                  </Typography>
                  <Typography variant="body2" sx={{ maxWidth: 300, mx: 'auto' }}>
                    Click on any name from the list to view their short answers and download their resume.
                  </Typography>
                </Box>
              ) : (
                <>
                  {/* Selected applicant header */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                    <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: '1.5rem' }}>
                        {selected.name.charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 800, color: '#0F172A' }} variant="h4">
                          {selected.name}
                        </Typography>
                        <Typography sx={{ fontWeight: 600, color: 'primary.main' }} variant="subtitle1">
                          {selected.project}
                        </Typography>
                        <Typography sx={{ color: '#64748B' }} variant="body2">
                          {selected.email}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  <Divider sx={{ mb: 4 }} />

                  {/* Short Answers */}
                  <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 3 }} variant="h6">
                    Short Answers
                  </Typography>
                  
                  <Box sx={{ mb: 4 }}>
                    {selected.answers.map((answer: any, i: number) => (
                      <Box key={i} sx={{ mb: 3, p: 3, bgcolor: '#F8FAFC', borderRadius: 2, border: '1px solid #E2E8F0' }}>
                        <Typography sx={{ fontWeight: 700, color: '#1E293B', mb: 1 }} variant="subtitle2">
                          {answer.q}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#475569', lineHeight: 1.6 }}>
                          {answer.a}
                        </Typography>
                      </Box>
                    ))}
                  </Box>

                  <Divider sx={{ mb: 4 }} />

                  {/* Actions */}
                  <Box sx={{ display: 'flex', gap: 2, mt: 'auto' }}>
                    <Button 
                      variant="contained" 
                      color="success" 
                      startIcon={<CheckCircleIcon />}
                      onClick={approveApplicant}
                      sx={{ flexGrow: 1, py: 1.5, borderRadius: 2 }}
                    >
                      Approve
                    </Button>
                    <Button 
                      variant="outlined" 
                      color="error" 
                      startIcon={<CancelIcon />}
                      onClick={rejectApplicant}
                      sx={{ flexGrow: 1, py: 1.5, borderRadius: 2 }}
                    >
                      Reject
                    </Button>
                    <Button 
                      variant="contained" 
                      color="primary" 
                      startIcon={<DownloadIcon />}
                      onClick={downloadResume}
                      sx={{ flexGrow: 1, py: 1.5, borderRadius: 2 }}
                    >
                      Resume
                    </Button>
                  </Box>
                </>
              )}
            </Paper>
          </Grid>

        </Grid>
      </Box>
    </Box>
  );
}
