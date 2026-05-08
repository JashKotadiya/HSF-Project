'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ApplicationForm from '@/components/ApplicationForm';

export default function ApplyPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const supabase = createClient();
  
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);

  useEffect(() => {
    const fetchJob = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      if (session.user?.user_metadata?.role !== 'volunteer') {
        router.push('/dashboard');
        return;
      }
      
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', jobId)
        .single();
        
      if (data) {
        setJob(data);
      }
      setLoading(false);
    };

    fetchJob();
  }, [jobId, router, supabase]);

  if (loading) return <Box sx={{ p: 4 }}>Loading application...</Box>;
  if (!job) return <Box sx={{ p: 4 }}>Job not found.</Box>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F8FAFC', pb: 8 }}>
      {/* HEADER */}
      <Box sx={{ bgcolor: 'primary.dark', color: 'primary.contrastText', py: 6, px: 2, mb: -10 }}>
        <Container maxWidth="md">
          <Button 
            component={Link} 
            href={`/volunteer/jobs/${jobId}`} 
            startIcon={<ArrowBackIcon />} 
            sx={{ mb: 3, color: 'rgba(255,255,255,0.7)', '&:hover': { color: 'white' } }}
          >
            Back to Job Details
          </Button>
          <Typography variant="h2" sx={{ fontSize: '2.5rem', fontWeight: 800, mb: 1 }}>
            Apply to Project
          </Typography>
          <Typography variant="h6" sx={{ fontWeight: 400, opacity: 0.9 }}>
            {job.title} at {job.organization_name || 'Organization'}
          </Typography>
        </Container>
      </Box>

      {/* FORM CONTAINER */}
      <Container maxWidth="md" sx={{ mt: 14 }}>
        <ApplicationForm />
      </Container>
    </Box>
  );
}
