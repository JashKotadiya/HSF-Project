'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import {
  Container, Box, Typography, Button, TextField, FormControl,
  InputLabel, Select, MenuItem, Paper, Grid, IconButton, Divider,
  AppBar, Toolbar
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

export default function EditPost() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;
  const isNew = postId === 'new';

  const supabase = createClient();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'Draft' | 'Active' | 'Closed'>('Draft');
  const [posterName, setPosterName] = useState('');
  
  // New detailed fields
  const [orgName, setOrgName] = useState('');
  const [location, setLocation] = useState('');
  const [cause, setCause] = useState('');
  const [skills, setSkills] = useState<string[]>(['']);
  
  const [whatWeNeed, setWhatWeNeed] = useState('');
  const [additionalDetails, setAdditionalDetails] = useState('');
  const [whatWeHave, setWhatWeHave] = useState('');
  const [howThisHelps, setHowThisHelps] = useState('');
  
  const [volExperience, setVolExperience] = useState('');
  const [volAvailability, setVolAvailability] = useState('');
  
  const [orgMission, setOrgMission] = useState('');
  const [orgFunFact, setOrgFunFact] = useState('');
  
  const [milestones, setMilestones] = useState<{title: string, details: string}[]>([
    { title: '', details: '' }
  ]);

  useEffect(() => {
    const fetchPost = async () => {
      if (isNew) return;
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
        setTitle(data.title || '');
        setContent(data.content || '');
        setStatus(data.status || 'Draft');
        setPosterName(data.poster_name || '');
        setOrgName(data.organization_name || '');
        setLocation(data.location || '');
        setCause(data.cause || '');
        setSkills(data.skills_needed || ['']);
        setWhatWeNeed(data.what_we_need || '');
        setAdditionalDetails(data.additional_details || '');
        setWhatWeHave(data.what_we_have_in_place || '');
        setHowThisHelps(data.how_this_will_help || '');
        setVolExperience(data.volunteer_experience || '');
        setVolAvailability(data.volunteer_availability || '');
        setOrgMission(data.org_mission || '');
        setOrgFunFact(data.org_fun_fact || '');
        
        if (data.milestones && Array.isArray(data.milestones) && data.milestones.length > 0) {
          setMilestones(data.milestones);
        }
      }
      setLoading(false);
    };

    fetchPost();
  }, [postId, isNew, router, supabase]);

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Filter out empty arrays
    const cleanSkills = skills.filter(s => s.trim() !== '');
    const cleanMilestones = milestones.filter(m => m.title.trim() !== '');

    const payload = {
      title,
      content,
      status,
      poster_name: posterName,
      organization_name: orgName,
      location,
      cause,
      skills_needed: cleanSkills,
      what_we_need: whatWeNeed,
      additional_details: additionalDetails,
      what_we_have_in_place: whatWeHave,
      how_this_will_help: howThisHelps,
      volunteer_experience: volExperience,
      volunteer_availability: volAvailability,
      milestones: cleanMilestones,
      org_mission: orgMission,
      org_fun_fact: orgFunFact
    };

    if (isNew) {
      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        ...payload
      });
      if (!error) router.push('/dashboard');
    } else {
      const { error } = await supabase.from('posts').update(payload).eq('id', postId);
      if (!error) router.push(`/dashboard/post/${postId}`); // Redirect to view page
    }
    setSaving(false);
  };

  if (loading) return <Box sx={{ p: 4 }}>Loading...</Box>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F8FAFC', pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid #E2E8F0', bgcolor: 'white' }}>
        <Toolbar>
          <Button component={Link} href="/dashboard" startIcon={<ArrowBackIcon />} color="inherit">
            Back to Dashboard
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="h4" fontWeight={700} color="#0F172A" mb={3}>
          {isNew ? 'Create New Project' : 'Edit Project Details'}
        </Typography>

        <Paper sx={{ p: 4, borderRadius: 3, border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
          {/* BASIC INFO */}
          <Typography variant="h6" fontWeight={600} color="#334155" mb={2}>Basic Information</Typography>
          <Grid container spacing={2} mb={4}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Project Title" value={title} onChange={e => setTitle(e.target.value)} required />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="High-level Description" multiline rows={3} value={content} onChange={e => setContent(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={status} label="Status" onChange={e => setStatus(e.target.value as any)}>
                  <MenuItem value="Draft">Draft</MenuItem>
                  <MenuItem value="Active">Active</MenuItem>
                  <MenuItem value="Closed">Completed</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Poster Name (Optional)" value={posterName} onChange={e => setPosterName(e.target.value)} />
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* ORG INFO */}
          <Typography variant="h6" fontWeight={600} color="#334155" mb={2}>Organization Details</Typography>
          <Grid container spacing={2} mb={4}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Organization Name" value={orgName} onChange={e => setOrgName(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Location" value={location} onChange={e => setLocation(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Cause (e.g. Human Services)" value={cause} onChange={e => setCause(e.target.value)} />
            </Grid>
          </Grid>
          <Grid container spacing={2} mb={4}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Our Mission" multiline rows={2} value={orgMission} onChange={e => setOrgMission(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Fun Fact" multiline rows={2} value={orgFunFact} onChange={e => setOrgFunFact(e.target.value)} />
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* PROJECT DETAILS */}
          <Typography variant="h6" fontWeight={600} color="#334155" mb={2}>Project Details Tab</Typography>
          <Grid container spacing={2} mb={4}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="What we need" multiline rows={3} value={whatWeNeed} onChange={e => setWhatWeNeed(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Additional details" multiline rows={3} value={additionalDetails} onChange={e => setAdditionalDetails(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="What we have in place" multiline rows={2} value={whatWeHave} onChange={e => setWhatWeHave(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="How this will help" multiline rows={3} value={howThisHelps} onChange={e => setHowThisHelps(e.target.value)} />
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* THE RIGHT VOLUNTEER */}
          <Typography variant="h6" fontWeight={600} color="#334155" mb={2}>The Right Volunteer</Typography>
          <Grid container spacing={2} mb={2}>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Volunteer Experience Needed (Bullet points)" multiline rows={3} value={volExperience} onChange={e => setVolExperience(e.target.value)} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Availability Requirements (Bullet points)" multiline rows={2} value={volAvailability} onChange={e => setVolAvailability(e.target.value)} />
            </Grid>
          </Grid>
          
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" color="#64748B" mb={1}>Skills Needed</Typography>
            {skills.map((skill, index) => (
              <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <TextField 
                  fullWidth size="small" value={skill} 
                  onChange={e => {
                    const newSkills = [...skills];
                    newSkills[index] = e.target.value;
                    setSkills(newSkills);
                  }}
                />
                <IconButton onClick={() => setSkills(skills.filter((_, i) => i !== index))} color="error">
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={() => setSkills([...skills, ''])}>Add Skill</Button>
          </Box>
          <Divider sx={{ mb: 4 }} />

          {/* PROJECT PLAN MILESTONES */}
          <Typography variant="h6" fontWeight={600} color="#334155" mb={2}>Project Plan (Milestones)</Typography>
          <Box sx={{ mb: 4 }}>
            {milestones.map((m, index) => (
              <Box key={index} sx={{ p: 2, mb: 2, border: '1px solid #E2E8F0', borderRadius: 2, bgcolor: '#F8FAFC' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={600}>Milestone {index + 1}</Typography>
                  <IconButton size="small" onClick={() => setMilestones(milestones.filter((_, i) => i !== index))} color="error">
                    <DeleteIcon />
                  </IconButton>
                </Box>
                <TextField 
                  fullWidth label="Milestone Title" size="small" sx={{ mb: 2, bgcolor: 'white' }}
                  value={m.title} 
                  onChange={e => {
                    const newM = [...milestones];
                    newM[index].title = e.target.value;
                    setMilestones(newM);
                  }}
                />
                <TextField 
                  fullWidth label="Details (Bullet points)" size="small" multiline rows={2} sx={{ bgcolor: 'white' }}
                  value={m.details} 
                  onChange={e => {
                    const newM = [...milestones];
                    newM[index].details = e.target.value;
                    setMilestones(newM);
                  }}
                />
              </Box>
            ))}
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setMilestones([...milestones, {title: '', details: ''}])}>
              Add Milestone
            </Button>
          </Box>

          {/* SUBMIT */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 6 }}>
            <Button component={Link} href="/dashboard" color="inherit" disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} variant="contained" color="primary" disabled={!title || saving} size="large">
              {saving ? 'Saving...' : 'Save Project'}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
