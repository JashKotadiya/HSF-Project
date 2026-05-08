'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Divider from '@mui/material/Divider';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Grid from '@mui/material/Grid';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PersonIcon from '@mui/icons-material/Person';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import LinkIcon from '@mui/icons-material/Link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';

interface Job {
  id: string;
  title: string;
  content?: string;
  status: string;
  poster_name?: string;
  organization_name?: string;
  location?: string;
  cause?: string;
  skills_needed?: any;
  what_we_need?: string;
  additional_details?: string;
  what_we_have_in_place?: string;
  timeline?: string;
  how_this_will_help?: string;
  volunteer_experience?: string;
  volunteer_availability?: string;
  milestones?: string;
  org_mission?: string;
  org_fun_fact?: string;
  created_at: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function CustomTabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 4 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

export default function JobDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tabValue, setTabValue] = useState(0);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      if (session.user?.user_metadata?.role !== 'volunteer') {
        router.push('/dashboard');
        return;
      }
      fetchJobDetails();
    };
    void checkAuth();
  }, [id, router, supabase]);

  const fetchJobDetails = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/jobs/${id}`);
      if (response.ok) {
        const data = await response.json();
        setJob(data);
      } else {
        setError('Job not found or is no longer active.');
      }
    } catch (err) {
      setError('An error occurred while fetching the project details.');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Helper to safely parse skills if it's stored as a JSON string
  const getSkills = (skillsData: any): string[] => {
    if (!skillsData) return [];
    if (Array.isArray(skillsData)) return skillsData;
    if (typeof skillsData === 'string') {
      try {
        const parsed = JSON.parse(skillsData);
        if (Array.isArray(parsed)) return parsed;
        return [skillsData];
      } catch (e) {
        return [skillsData];
      }
    }
    return [];
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Skeleton variant="text" width="60%" height={80} />
        <Skeleton variant="rectangular" width="100%" height={400} sx={{ my: 4, borderRadius: 2 }} />
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 2 }} />
          </Grid>
        </Grid>
      </Container>
    );
  }

  if (error || !job) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h4" color="error" gutterBottom>
          Oops!
        </Typography>
        <Typography color="text.secondary">
          {error || 'Could not load the project details.'}
        </Typography>
        <Button variant="contained" component={Link} href="/volunteer" sx={{ mt: 4 }}>
          Back to Job Board
        </Button>
      </Container>
    );
  }

  const skills = getSkills(job.skills_needed);
  const formattedDate = new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF' }}>
      {/* Top Header Section */}
      <Container maxWidth="lg" sx={{ pt: 6, pb: 4 }}>
        <Button 
          component={Link} 
          href="/volunteer" 
          startIcon={<ArrowBackIcon />} 
          sx={{ mb: 3, color: '#64748B', '&:hover': { bgcolor: 'transparent', color: '#0F172A' } }}
        >
          Back to Dashboard
        </Button>
        <Typography variant="h1" sx={{ color: '#0F172A', mb: 2 }}>
          {job.title}
        </Typography>
        <Typography variant="h6" sx={{ color: '#475569', fontWeight: 400, maxWidth: '800px' }}>
          Help <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>{job.organization_name || 'this organization'}</Box> by volunteering your time and expertise for this critical project.
        </Typography>
      </Container>

      {/* Banner & Summary Card Section */}
      <Container maxWidth="lg" sx={{ mb: 6 }}>
        <Grid container spacing={4}>
          {/* Main Image Banner */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Box 
              sx={{ 
                width: '100%', 
                height: { xs: 300, md: 450 }, 
                bgcolor: '#E2E8F0', 
                borderRadius: 2,
                backgroundImage: 'url("https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80")',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'relative'
              }}
            />
            
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 3, color: '#475569' }}>
              <Typography sx={{ fontWeight: 600, mr: 2 }}>Share this project:</Typography>
              <IconButton size="small" color="primary"><FacebookIcon /></IconButton>
              <IconButton size="small" color="primary"><TwitterIcon /></IconButton>
              <IconButton size="small" color="primary"><LinkedInIcon /></IconButton>
              <IconButton size="small" color="primary"><LinkIcon /></IconButton>
            </Box>
          </Grid>

          {/* Right Summary Card */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Box sx={{ position: 'sticky', top: 24 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
                <Avatar sx={{ width: 64, height: 64, mr: 2, bgcolor: 'primary.light' }}>
                  {job.organization_name ? job.organization_name[0] : 'O'}
                </Avatar>
                <Box>
                  <Typography variant="h6" sx={{ color: '#0F172A', fontWeight: 600, lineHeight: 1.2 }}>
                    {job.organization_name || 'Organization'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748B', display: 'flex', alignItems: 'center', mt: 0.5 }}>
                    <LocationOnIcon sx={{ fontSize: 16, mr: 0.5 }} /> {job.location || 'Remote'}
                  </Typography>
                </Box>
              </Box>

              <Typography variant="subtitle2" sx={{ color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
                Cause
              </Typography>
              {job.cause ? (
                <Chip label={job.cause} variant="outlined" sx={{ mb: 3, borderRadius: 1, borderColor: '#CBD5E1' }} />
              ) : (
                <Typography variant="body2" sx={{ mb: 3, fontStyle: 'italic', color: '#94A3B8' }}>Not specified</Typography>
              )}

              <Typography variant="subtitle2" sx={{ color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
                Skills
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 4 }}>
                {skills.length > 0 ? (
                  skills.map((skill, idx) => (
                    <Chip key={idx} label={skill} variant="outlined" sx={{ borderRadius: 1, borderColor: '#CBD5E1' }} />
                  ))
                ) : (
                  <Typography variant="body2" sx={{ fontStyle: 'italic', color: '#94A3B8' }}>No specific skills listed</Typography>
                )}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', color: '#64748B', mb: 3 }}>
                <CalendarTodayIcon sx={{ fontSize: 18, mr: 1 }} />
                <Typography variant="body2">Posted {formattedDate}</Typography>
              </Box>

              <Button 
                component={Link}
                href={`/volunteer/jobs/${job.id}/apply`}
                variant="contained" 
                color="primary" 
                fullWidth 
                size="large"
                sx={{ 
                  py: 2, 
                  fontSize: '1.1rem', 
                  borderRadius: 8,
                  textTransform: 'none'
                }}
              >
                Apply now
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* Tabs Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#FFFFFF' }}>
        <Container maxWidth="lg">
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange} 
            sx={{ 
              '& .MuiTab-root': { 
                textTransform: 'none', 
                fontWeight: 600,
                fontSize: '1.1rem',
                color: '#64748B',
                minWidth: 'auto',
                mr: 4,
                px: 0
              },
              '& .Mui-selected': {
                color: '#0F172A'
              }
            }}
          >
            <Tab label="Project details" />
            <Tab label="About the org" />
          </Tabs>
        </Container>
      </Box>

      {/* Tab Contents */}
      <Box sx={{ bgcolor: '#F8FAFC', minHeight: '50vh', borderTop: '1px solid #E2E8F0' }}>
        <Container maxWidth="lg">
          
          {/* Project Details Tab */}
          <CustomTabPanel value={tabValue} index={0}>
            <Grid container spacing={6}>
              {/* Left Column */}
              <Grid size={{ xs: 12, md: 8 }}>
                <Typography variant="h4" sx={{ color: '#0F172A', mb: 1, fontWeight: 600 }}>
                  What we need
                </Typography>
                <Typography variant="body1" sx={{ color: '#334155', mb: 4, fontSize: '1.125rem', whiteSpace: 'pre-line', lineHeight: 1.8 }}>
                  {job.what_we_need || job.content || "No details provided."}
                </Typography>

                {job.what_we_have_in_place && (
                  <>
                    <Typography variant="h4" sx={{ color: '#0F172A', mb: 1, fontWeight: 600 }}>
                      What we have in place
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#334155', mb: 4, fontSize: '1.125rem', whiteSpace: 'pre-line', lineHeight: 1.8 }}>
                      {job.what_we_have_in_place}
                    </Typography>
                  </>
                )}

                {job.additional_details && (
                  <>
                    <Typography variant="h4" sx={{ color: '#0F172A', mb: 1, fontWeight: 600 }}>
                      Additional Details
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#334155', mb: 4, fontSize: '1.125rem', whiteSpace: 'pre-line', lineHeight: 1.8 }}>
                      {job.additional_details}
                    </Typography>
                  </>
                )}

                {job.how_this_will_help && (
                  <>
                    <Typography variant="h4" sx={{ color: '#0F172A', mb: 1, fontWeight: 600 }}>
                      How this will help
                    </Typography>
                    <Typography variant="body1" sx={{ color: '#334155', mb: 4, fontSize: '1.125rem', whiteSpace: 'pre-line', lineHeight: 1.8 }}>
                      {job.how_this_will_help}
                    </Typography>
                  </>
                )}
              </Grid>

              {/* Right Column */}
              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ bgcolor: '#EFF6FF', p: 4, borderRadius: 2 }}>
                  <Typography variant="h5" sx={{ color: '#1D4ED8', mb: 4, fontWeight: 600 }}>
                    The right volunteer
                  </Typography>
                  
                  <Typography variant="h6" sx={{ color: '#0F172A', mb: 2 }}>
                    Skills & experience
                  </Typography>
                  {skills.map((skill, idx) => (
                    <Chip key={idx} label={skill} variant="outlined" sx={{ mb: 1, mr: 1, bgcolor: '#FFFFFF', borderColor: '#CBD5E1' }} />
                  ))}
                  
                  <Divider sx={{ my: 4, borderColor: '#BFDBFE' }} />

                  <Typography variant="h6" sx={{ color: '#0F172A', mb: 2 }}>
                    Availability
                  </Typography>
                  <Box component="ul" sx={{ color: '#334155', pl: 2, m: 0, '& li': { mb: 1 } }}>
                    <li>{job.volunteer_availability || job.location || 'Works remotely from anywhere'}</li>
                    {job.timeline && <li>{job.timeline}</li>}
                  </Box>
                </Box>
              </Grid>
            </Grid>
          </CustomTabPanel>

          {/* About the Org Tab */}
          <CustomTabPanel value={tabValue} index={1}>
            <Grid container spacing={6}>
              <Grid size={{ xs: 12, md: 8 }}>
                <Typography variant="h4" sx={{ color: '#0F172A', mb: 3, fontWeight: 600 }}>
                  About {job.organization_name || 'the Organization'}
                </Typography>
                
                <Grid container spacing={4} sx={{ mb: 6 }}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="subtitle2" sx={{ color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
                      Causes
                    </Typography>
                    {job.cause && <Chip label={job.cause} variant="outlined" sx={{ borderRadius: 1 }} />}
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Typography variant="subtitle2" sx={{ color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
                      Posted by
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                        {job.poster_name ? job.poster_name[0].toUpperCase() : <PersonIcon />}
                      </Avatar>
                      <Box>
                        <Typography variant="subtitle1" sx={{ color: '#0F172A', fontWeight: 600, lineHeight: 1.2 }}>
                          {job.poster_name || 'Administrator'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748B' }}>
                          Project Poster
                        </Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>

                <Typography variant="h5" sx={{ color: '#0F172A', mb: 1, fontWeight: 600 }}>
                  Our mission
                </Typography>
                <Typography variant="body1" sx={{ color: '#334155', fontSize: '1.125rem', whiteSpace: 'pre-line', lineHeight: 1.8 }}>
                  {job.org_mission || "Our mission is to engage volunteers to build stronger communities."}
                </Typography>
              </Grid>
              
              <Grid size={{ xs: 12, md: 4 }}>
                <Box sx={{ bgcolor: '#FEF9C3', p: 4, borderRadius: 2 }}>
                  <Typography variant="h4" sx={{ mb: 2 }}>✨</Typography>
                  <Typography variant="h5" sx={{ color: '#0F172A', mb: 2, fontWeight: 600 }}>
                    Fun Fact
                  </Typography>
                  <Typography variant="body1" sx={{ color: '#334155', mb: 4, whiteSpace: 'pre-line' }}>
                    {job.org_fun_fact || "This is an active project waiting for the perfect volunteer to apply!"}
                  </Typography>
                  
                  <Button 
                    variant="outlined" 
                    fullWidth 
                    sx={{ 
                      borderRadius: 8, 
                      borderColor: '#0F172A', 
                      color: '#0F172A',
                      '&:hover': {
                        borderColor: '#0F172A',
                        bgcolor: 'rgba(15, 23, 42, 0.04)'
                      }
                    }}
                  >
                    More about the org
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </CustomTabPanel>
          
        </Container>
      </Box>
    </Box>
  );
}
