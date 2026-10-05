'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid';
import Avatar from '@mui/material/Avatar';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EditIcon from '@mui/icons-material/Edit';

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
      id={`project-tabpanel-${index}`}
      aria-labelledby={`project-tab-${index}`}
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

export default function ProjectDetailView() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;
  const supabase = createClient();
  
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<any>(null);
  const [tabValue, setTabValue] = useState(0);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const fetchPost = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      if (session.user?.user_metadata?.role === 'volunteer') {
        router.push('/volunteer');
        return;
      }
      
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();
        
      if (data) {
        setPost(data);
        setIsOwner(data.user_id === session.user.id);
      }
      setLoading(false);
    };

    fetchPost();
  }, [postId, router, supabase]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  if (loading) return <Box sx={{ p: 4 }}>Loading project...</Box>;
  if (!post) return <Box sx={{ p: 4 }}>Project not found.</Box>;

  // Convert bullet point text areas into arrays
  const renderBullets = (text: string) => {
    if (!text) return null;
    return (
      <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155' }}>
        {text.split('\n').map((line, i) => (
          line.trim() ? <li key={i} style={{ marginBottom: '8px' }}>{line.trim()}</li> : null
        ))}
      </ul>
    );
  };

  const renderParagraphs = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => (
      line.trim() ? <Typography key={i} variant="body1" sx={{ color: '#334155', mb: 2 }}>{line.trim()}</Typography> : null
    ));
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', pb: 8 }}>
      {/* HEADER */}
      <Box sx={{ borderBottom: '1px solid #E2E8F0', bgcolor: '#F8FAFC', py: 2 }}>
        <Container maxWidth="lg">
          <Button component={Link} href="/dashboard" startIcon={<ArrowBackIcon />} sx={{ mb: 2, fontWeight: 600 }}>
            Back to all projects
          </Button>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 1 }} variant="h3">
                {post.title}
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 400, color: '#475569', maxWidth: '800px' }}>
                {post.content}
              </Typography>
            </Box>
            {isOwner && (
              <Button 
                variant="outlined" 
                startIcon={<EditIcon />} 
                component={Link} 
                href={`/dashboard/edit/${post.id}`}
                sx={{ ml: 2, flexShrink: 0 }}
              >
                Edit Project
              </Button>
            )}
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Grid container spacing={4}>
          {/* MAIN CONTENT (LEFT) */}
          <Grid size={{ xs: 12, md: 8 }}>
            {/* Banner Image Placeholder */}
            <Box 
              sx={{ 
                width: '100%', 
                height: '350px', 
                bgcolor: '#F1F5F9', 
                borderRadius: 2, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                mb: 4,
                border: '1px dashed #CBD5E1'
              }}
            >
              <Typography sx={{ color: '#94A3B8' }} variant="h6">Banner Image Placeholder</Typography>
            </Box>

            {/* TABS */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={handleTabChange} aria-label="project tabs">
                <Tab label="Project details" sx={{ fontWeight: 600, textTransform: 'none', fontSize: '1rem' }} />
                <Tab label="Project plan" sx={{ fontWeight: 600, textTransform: 'none', fontSize: '1rem' }} />
                <Tab label="About the org" sx={{ fontWeight: 600, textTransform: 'none', fontSize: '1rem' }} />
              </Tabs>
            </Box>

            {/* TAB 1: DETAILS */}
            <CustomTabPanel value={tabValue} index={0}>
              {post.what_we_need && (
                <Box sx={{ mb: 4 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 2 }} variant="h6">What we need</Typography>
                  {renderParagraphs(post.what_we_need)}
                </Box>
              )}
              {post.additional_details && (
                <Box sx={{ mb: 4 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 2 }} variant="h6">Additional details</Typography>
                  {renderParagraphs(post.additional_details)}
                </Box>
              )}
              {post.what_we_have_in_place && (
                <Box sx={{ mb: 4 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 2 }} variant="h6">What we have in place</Typography>
                  {renderParagraphs(post.what_we_have_in_place)}
                </Box>
              )}
              {post.how_this_will_help && (
                <Box sx={{ mb: 4 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 2 }} variant="h6">How this will help</Typography>
                  {renderParagraphs(post.how_this_will_help)}
                </Box>
              )}
            </CustomTabPanel>

            {/* TAB 2: PLAN */}
            <CustomTabPanel value={tabValue} index={1}>
              {(!post.milestones || post.milestones.length === 0) ? (
                <Typography sx={{ color: 'text.secondary' }}>No milestones defined.</Typography>
              ) : (
                <Box sx={{ position: 'relative', pl: 3 }}>
                  {/* Simple vertical line for timeline */}
                  <Box sx={{ position: 'absolute', left: '11px', top: '24px', bottom: '24px', width: '2px', bgcolor: '#16A34A' }} />
                  
                  {post.milestones.map((m: any, idx: number) => (
                    <Box key={idx} sx={{ position: 'relative', mb: 5 }}>
                      {/* Milestone Number Circle */}
                      <Box sx={{ 
                        position: 'absolute', left: '-35px', top: '0', 
                        width: '30px', height: '30px', borderRadius: '50%', 
                        bgcolor: 'white', border: '2px solid #16A34A',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, color: '#16A34A', zIndex: 1
                      }}>
                        {idx + 1}
                      </Box>
                      
                      <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 1 }} variant="h6">{m.title}</Typography>
                      {renderBullets(m.details)}
                    </Box>
                  ))}
                </Box>
              )}
            </CustomTabPanel>

            {/* TAB 3: ABOUT */}
            <CustomTabPanel value={tabValue} index={2}>
              <Grid sx={{ mb: 4 }} container spacing={4}>
                <Grid size={{ xs: 6 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 1 }} variant="subtitle1">Causes</Typography>
                  {post.cause ? <Chip label={post.cause} variant="outlined" /> : <Typography sx={{ color: 'text.secondary' }}>Not specified</Typography>}
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 1 }} variant="subtitle1">Posted by</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar><PersonIcon /></Avatar>
                    <Box>
                      <Typography sx={{ fontWeight: 600, color: '#2563EB' }} variant="body1">{post.poster_name || 'User'}</Typography>
                      <Typography sx={{ color: 'text.secondary' }} variant="caption">Project Poster</Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>

              {post.org_mission && (
                <Box sx={{ mb: 4 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 2 }} variant="h6">Our mission</Typography>
                  {renderParagraphs(post.org_mission)}
                </Box>
              )}
            </CustomTabPanel>
          </Grid>

          {/* RIGHT SIDEBAR */}
          <Grid size={{ xs: 12, md: 4 }}>
            {/* Top Widget: Org & Apply */}
            <Box sx={{ mb: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
                <Avatar sx={{ width: 64, height: 64, bgcolor: '#F1F5F9', color: '#64748B' }}>
                  <Typography sx={{ fontWeight: 700 }} variant="h5">{post.organization_name ? post.organization_name.charAt(0) : 'O'}</Typography>
                </Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 700, color: '#0F172A' }} variant="subtitle1">{post.organization_name || 'Organization Name'}</Typography>
                  <Typography sx={{ color: '#64748B' }} variant="body2">{post.location || 'Location not specified'}</Typography>
                </Box>
              </Box>

              <Typography sx={{ color: '#64748B', mb: 1 }} variant="subtitle2">Cause</Typography>
              <Box sx={{ mb: 3 }}>
                {post.cause ? <Chip label={post.cause} variant="outlined" size="small" /> : '-'}
              </Box>

              <Typography sx={{ color: '#64748B', mb: 1 }} variant="subtitle2">Skills</Typography>
              <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {post.skills_needed && post.skills_needed.length > 0 ? (
                  post.skills_needed.map((skill: string, i: number) => (
                    <Chip key={i} label={skill} variant="outlined" size="small" />
                  ))
                ) : '-'}
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#64748B', mb: 3 }}>
                <CalendarTodayIcon fontSize="small" />
                <Typography variant="body2">Posted {new Date(post.created_at).toLocaleDateString()}</Typography>
              </Box>

              <Paper sx={{ p: 2, bgcolor: '#FFEDD5', borderRadius: 1, border: 'none', textAlign: 'center' }}>
                <Typography sx={{ color: '#9A3412' }} variant="body2">
                  You are viewing your own post, so you cannot apply.
                </Typography>
              </Paper>
            </Box>

            {/* Right Volunteer Widget (only shows on Details Tab) */}
            {tabValue === 0 && (
              <Paper sx={{ p: 3, bgcolor: '#F8FAFC', borderRadius: 2, border: 'none' }}>
                <Typography sx={{ fontWeight: 700, color: '#2563EB', mb: 3 }} variant="h6">The right volunteer</Typography>
                
                <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 1 }} variant="subtitle1">Skills & experience</Typography>
                {renderBullets(post.volunteer_experience)}
                
                <Divider sx={{ my: 3 }} />

                <Typography sx={{ fontWeight: 700, color: '#0F172A', mb: 1 }} variant="subtitle1">Availability</Typography>
                {renderBullets(post.volunteer_availability)}
              </Paper>
            )}

            {/* Fun Fact Widget (only shows on About Tab) */}
            {tabValue === 2 && post.org_fun_fact && (
              <Paper sx={{ p: 3, bgcolor: '#FEF9C3', borderRadius: 2, border: 'none' }}>
                <Typography sx={{ fontWeight: 700, color: '#854D0E', mb: 2 }} variant="h6">✨ Fun Fact</Typography>
                <Typography sx={{ color: '#713F12' }} variant="body2">
                  {post.org_fun_fact}
                </Typography>
              </Paper>
            )}
          </Grid>

        </Grid>
      </Container>
    </Box>
  );
}
