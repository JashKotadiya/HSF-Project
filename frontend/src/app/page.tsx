'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio
} from '@mui/material';

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'organization' | 'volunteer'>('volunteer');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const oauthError = params.get('error_description') ?? params.get('error');

      if (oauthError) {
        setError(oauthError);
        window.history.replaceState(null, '', '/');
        return;
      }

      // Email confirmation / OAuth (PKCE): Supabase redirects here with ?code=...
      if (code) {
        const { data, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(window.location.href);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
        window.history.replaceState(null, '', '/');
        
        const userRole = data.session?.user?.user_metadata?.role;
        if (userRole === 'volunteer') {
          router.replace('/volunteer');
        } else {
          router.replace('/dashboard');
        }
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        const userRole = session.user?.user_metadata?.role;
        if (userRole === 'volunteer') {
          router.push('/volunteer');
        } else {
          router.push('/dashboard');
        }
      }
    };
    void run();
  }, [router, supabase]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      const userRole = data.user?.user_metadata?.role;
      if (userRole === 'volunteer') {
        router.push('/volunteer');
      } else {
        router.push('/dashboard');
      }
    }
    setLoading(false);
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: role,
        }
      }
    });

    if (error) {
      setError(error.message);
    } else {
      setError('Sign up successful! Please check your inbox for a confirmation link to activate your account.');
    }
    setLoading(false);
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ mt: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Paper elevation={3} sx={{ p: 4, width: '100%', borderRadius: 3 }}>
          <Typography component="h1" variant="h4" align="center" color="primary" gutterBottom>
            BUILD UMass Discovery Platform
          </Typography>
          <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 4 }}>
            Sign in to discover opportunities or manage your posts.
          </Typography>
          
          <form onSubmit={handleLogin}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <FormControl component="fieldset" sx={{ mt: 2, mb: 1, width: '100%' }}>
              <FormLabel component="legend">I am a...</FormLabel>
              <RadioGroup
                row
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'organization' | 'volunteer')}
              >
                <FormControlLabel value="volunteer" control={<Radio />} label="Volunteer" />
                <FormControlLabel value="organization" control={<Radio />} label="Organization" />
              </RadioGroup>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                (Role selection is only used when signing up for a new account)
              </Typography>
            </FormControl>
            
            {error && (
              <Alert severity={error.includes('successful') ? 'success' : 'error'} sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3, mb: 2 }}
            >
              Sign In
            </Button>
            <Button
              fullWidth
              variant="outlined"
              size="large"
              onClick={handleSignUp}
              disabled={loading}
            >
              Sign Up
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
}
