'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import SearchIcon from '@mui/icons-material/Search';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';

// Define the interface for the job data
interface Job {
  id: string;
  title: string;
  organization_name?: string;
  location?: string;
  cause?: string;
  skills_needed?: any; // Assuming JSONB array or string
  poster_name?: string;
  created_at: string;
  status: string;
}

export default function JobBoard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

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
      fetchJobs();
    };
    void checkAuth();
  }, [router, supabase]);

  const fetchJobs = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/jobs`);
      if (response.ok) {
        const data = await response.json();
        setJobs(data);
      } else {
        console.error('Failed to fetch jobs');
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredJobs = jobs.filter(job =>
    job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (job.organization_name && job.organization_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (job.cause && job.cause.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header / Hero Section */}
      <Box sx={{ bgcolor: 'primary.dark', color: 'primary.contrastText', py: 8, px: 2, position: 'relative' }}>
        <Button 
          onClick={() => { supabase.auth.signOut().then(() => router.push('/')); }} 
          sx={{ position: 'absolute', top: 16, right: 16, color: 'white', borderColor: 'rgba(255,255,255,0.5)' }} 
          variant="outlined"
        >
          Sign Out
        </Button>
        <Container maxWidth="lg">
          <Typography variant="h1" gutterBottom sx={{ fontWeight: 800 }}>
            BUILD UMass Volunteer Discovery Platform
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, fontWeight: 400, opacity: 0.9, maxWidth: '800px' }}>
            Use your professional skills to help nonprofits solve critical challenges. Find a project that matches your expertise and start making an impact today.
          </Typography>
          
          <Box sx={{ bgcolor: 'white', borderRadius: 2, p: 1, display: 'flex', alignItems: 'center', maxWidth: '600px' }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Search by role, cause, or organization..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{
                '& fieldset': { border: 'none' },
                bgcolor: 'transparent',
              }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                }
              }}
            />
            <Button variant="contained" color="secondary" sx={{ ml: 1, py: 1.5, px: 4, borderRadius: 2 }}>
              Search
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Main Content */}
      <Container maxWidth="lg" sx={{ flexGrow: 1, py: 6 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h2" sx={{ fontSize: '1.75rem', color: '#1E293B' }}>
            {loading ? 'Loading opportunities...' : `${filteredJobs.length} Active Projects`}
          </Typography>
        </Box>

        {loading ? (
          <Grid container spacing={4}>
            {Array.from(new Array(6)).map((_, index) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
                <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        ) : filteredJobs.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10, bgcolor: '#FFFFFF', borderRadius: 2, border: '1px solid #E2E8F0' }}>
            <AssignmentTurnedInIcon sx={{ fontSize: 60, color: '#94A3B8', mb: 2 }} />
            <Typography variant="h5" color="text.secondary" gutterBottom>
              No projects found
            </Typography>
            <Typography color="text.secondary">
              Try adjusting your search criteria or check back later for new opportunities.
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={4}>
            {filteredJobs.map((job) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={job.id}>
                <Card sx={{ 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column',
                  borderRadius: 3,
                  border: '1px solid #E2E8F0',
                }}>
                  {/* Card Header styling based on cause or generic styling */}
                  <Box sx={{ 
                    height: 8, 
                    bgcolor: job.cause === 'Education' ? '#10B981' : 
                             job.cause === 'Environment' ? '#F59E0B' : 
                             job.cause === 'Health' ? '#EF4444' : 'primary.main',
                    width: '100%'
                  }} />
                  
                  <CardContent sx={{ flexGrow: 1, p: 3, display: 'flex', flexDirection: 'column' }}>
                    {job.cause && (
                      <Chip 
                        label={job.cause} 
                        size="small" 
                        sx={{ 
                          mb: 2, 
                          alignSelf: 'flex-start',
                          bgcolor: '#EFF6FF',
                          color: 'primary.main',
                          fontWeight: 600,
                          fontSize: '0.75rem'
                        }} 
                      />
                    )}
                    
                    <Typography variant="h3" sx={{ mb: 1, color: '#0F172A', fontSize: '1.25rem', lineHeight: 1.4 }}>
                      {job.title}
                    </Typography>
                    
                    <Typography variant="subtitle1" sx={{ color: 'primary.main', fontWeight: 600, mb: 2 }}>
                      {job.organization_name || 'Organization Name Not Provided'}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary', mb: 1, fontSize: '0.875rem' }}>
                      <LocationOnIcon sx={{ fontSize: 18, mr: 1, color: '#64748B' }} />
                      {job.location || 'Remote'}
                    </Box>

                    {job.poster_name && (
                      <Box sx={{ display: 'flex', alignItems: 'center', color: 'text.secondary', mb: 2, fontSize: '0.875rem' }}>
                        <PersonIcon sx={{ fontSize: 18, mr: 1, color: '#64748B' }} />
                        Posted by {job.poster_name}
                      </Box>
                    )}

                    <Divider sx={{ my: 2 }} />

                    <Box sx={{ mb: 3, flexGrow: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569', mb: 1 }}>
                        Skills Needed:
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {getSkills(job.skills_needed).length > 0 ? (
                          getSkills(job.skills_needed).slice(0, 3).map((skill, index) => (
                            <Chip 
                              key={index} 
                              label={skill} 
                              size="small" 
                              variant="outlined" 
                              sx={{ color: '#475569', borderColor: '#CBD5E1' }}
                            />
                          ))
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            No specific skills listed
                          </Typography>
                        )}
                        {getSkills(job.skills_needed).length > 3 && (
                          <Chip 
                            label={`+${getSkills(job.skills_needed).length - 3} more`} 
                            size="small" 
                            variant="outlined" 
                            sx={{ color: '#475569', borderColor: '#CBD5E1' }}
                          />
                        )}
                      </Box>
                    </Box>

                    <Button 
                      variant="contained" 
                      color="primary" 
                      fullWidth
                      component={Link}
                      href={`/volunteer/jobs/${job.id}`}
                      sx={{ py: 1.25, borderRadius: 2 }}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </Box>
  );
}
