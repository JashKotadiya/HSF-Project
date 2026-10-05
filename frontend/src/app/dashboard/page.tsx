'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import IconButton from '@mui/material/IconButton';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import CardActionArea from '@mui/material/CardActionArea';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';
import PersonIcon from '@mui/icons-material/Person';

interface Post {
  id: string;
  title: string;
  content: string;
  status: 'Draft' | 'Active' | 'Closed';
  poster_name?: string;
  created_at: string;
  organization_name?: string;
  location?: string;
  cause?: string;
}

type PendingAction = 
  | { type: 'row_status', postId: string, status: string }
  | null;

function getBackendBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || 'http://localhost:8000'
  );
}

export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const [backendError, setBackendError] = useState<string | null>(null);
  
  // Confirmation Dialog State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const fetchPosts = useCallback(async (token: string) => {
    const backendUrl = getBackendBaseUrl();
    try {
      const res = await fetch(`${backendUrl}/posts`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
        setBackendError(null);
      } else {
        setBackendError(
          `Posts API returned ${res.status}. Is the backend running at ${backendUrl}?`
        );
      }
    } catch {
      // Safari often logs this as "TypeError: Load failed" (connection refused / wrong host).
      setBackendError(
        `Cannot reach the API at ${backendUrl}. Start the FastAPI server (e.g. uvicorn in backend/) or set NEXT_PUBLIC_BACKEND_URL if you use a different host/port.`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      if (session.user?.user_metadata?.role === 'volunteer') {
        router.push('/volunteer');
        return;
      }
      setSessionToken(session.access_token);
      
      const user = session.user;
      if (user?.email) {
        const namePart = user.email.split('@')[0];
        setUserName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
      }

      fetchPosts(session.access_token);
    };
    void checkAuthAndFetch();
  }, [router, supabase, fetchPosts]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // Row Status Actions
  const executeRowStatusUpdate = async (postId: string, newStatus: string) => {
    if (!sessionToken) return;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: newStatus as any } : p));

    try {
      const backendUrl = getBackendBaseUrl();
      const res = await fetch(`${backendUrl}/posts/${postId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) fetchPosts(sessionToken);
    } catch (err) {
      console.error(err);
      fetchPosts(sessionToken);
    }
  };

  const handleRowStatusAttempt = (postId: string, newStatus: string) => {
    const post = posts.find(p => p.id === postId);
    if (post && newStatus === 'Active' && post.status !== 'Active') {
      setPendingAction({ type: 'row_status', postId, status: newStatus });
      setConfirmOpen(true);
    } else {
      executeRowStatusUpdate(postId, newStatus);
    }
  };

  const handleDeletePost = async (postId: string) => {
    setPosts(prev => prev.filter(p => p.id !== postId));
    try {
      const { error } = await supabase.from('posts').delete().eq('id', postId);
      if (error) {
        console.error('Delete error:', error);
        if (sessionToken) fetchPosts(sessionToken);
      }
    } catch (err) {
      console.error(err);
      if (sessionToken) fetchPosts(sessionToken);
    }
  };

  // Confirmation Handling
  const handleConfirmPublish = (confirmed: boolean) => {
    if (confirmed && pendingAction) {
      if (pendingAction.type === 'row_status') {
        executeRowStatusUpdate(pendingAction.postId, pendingAction.status);
      }
    }
    setConfirmOpen(false);
    setPendingAction(null);
  };

  // Grouping
  const activePosts = posts.filter(p => p.status === 'Active');
  const draftPosts = posts.filter(p => p.status === 'Draft');
  const closedPosts = posts.filter(p => p.status === 'Closed');

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid #E2E8F0', bgcolor: 'white' }}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, color: 'primary.main', fontWeight: 700 }}>
            Nonprofit Portal
          </Typography>
          <Button color="inherit" onClick={handleSignOut}>Sign Out</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 6, mb: 6, flexGrow: 1 }}>
        {backendError && (
          <Alert severity="warning" sx={{ mb: 3 }} onClose={() => setBackendError(null)}>
            {backendError}
          </Alert>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
          <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 700 }}>
            Dashboard
          </Typography>
          <Box>
            <Button 
              variant="outlined" 
              component={Link} 
              href="/dashboard/applicants" 
              sx={{ mr: 2 }}
            >
              Review Applications
            </Button>
            <Button 
              variant="contained" 
              color="secondary" 
              startIcon={<AddIcon />}
              component={Link}
              href="/dashboard/edit/new"
            >
              Create Post
            </Button>
          </Box>
        </Box>

        {loading ? (
          <Grid container spacing={3}>
            {Array.from(new Array(3)).map((_, index) => (
              <Grid size={{ xs: 12, md: 4 }} key={index}>
                <Skeleton variant="rectangular" height={250} sx={{ borderRadius: 3 }} />
              </Grid>
            ))}
          </Grid>
        ) : posts.length === 0 ? (
          <Paper sx={{ py: 8, textAlign: 'center', borderRadius: 3, bgcolor: '#F8FAFC', border: '1px dashed #CBD5E1', boxShadow: 'none' }}>
            <Typography sx={{ color: 'text.secondary' }} variant="h6" gutterBottom>
              No projects found
            </Typography>
            <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
              Create your first project to get started!
            </Typography>
            <Button variant="outlined" color="primary" component={Link} href="/dashboard/edit/new">
              Create Post
            </Button>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activePosts.length > 0 && (
              <PostSection 
                title={`Live Projects (${activePosts.length})`} 
                posts={activePosts} 
                userName={userName}
                onDelete={handleDeletePost}
                onStatusChange={handleRowStatusAttempt}
              />
            )}
            
            {draftPosts.length > 0 && (
              <PostSection 
                title={`Drafts (${draftPosts.length})`} 
                posts={draftPosts} 
                userName={userName}
                onDelete={handleDeletePost}
                onStatusChange={handleRowStatusAttempt}
              />
            )}

            {closedPosts.length > 0 && (
              <PostSection 
                title={`Completed (${closedPosts.length})`} 
                posts={closedPosts} 
                userName={userName}
                onDelete={handleDeletePost}
                onStatusChange={handleRowStatusAttempt}
              />
            )}
          </Box>
        )}

        {/* Publish Confirmation Dialog */}
        <Dialog open={confirmOpen} onClose={() => handleConfirmPublish(false)}>
          <DialogTitle sx={{ fontWeight: 600 }}>Publish Opportunity?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This will publish the opportunity to the public. Proceed?
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => handleConfirmPublish(false)} color="inherit">No</Button>
            <Button onClick={() => handleConfirmPublish(true)} variant="contained" color="primary" autoFocus>
              Yes
            </Button>
          </DialogActions>
        </Dialog>

      </Container>
    </Box>
  );
}

function PostSection({ title, posts, userName, onDelete, onStatusChange }: {
  title: string,
  posts: Post[],
  userName: string,
  onDelete: (id: string) => void,
  onStatusChange: (id: string, status: string) => void
}) {
  return (
    <Box>
      <Typography variant="h6" sx={{ color: '#64748B', fontWeight: 600, mb: 2 }}>
        {title}
      </Typography>
      <Grid container spacing={3}>
        {posts.map(post => (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={post.id}>
            <PostCard 
              post={post} 
              userName={userName}
              onDelete={() => onDelete(post.id)}
              onStatusChange={(status) => onStatusChange(post.id, status)}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function PostCard({ post, userName, onDelete, onStatusChange }: { 
  post: Post, 
  userName: string,
  onDelete: () => void,
  onStatusChange: (status: string) => void,
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };
  
  const handleClose = (event?: any) => {
    if (event && event.stopPropagation) {
      event.stopPropagation();
      event.preventDefault();
    }
    setAnchorEl(null);
  };

  const handleMenuStatusChange = (event: React.MouseEvent, newStatus: string) => {
    event.stopPropagation();
    event.preventDefault();
    onStatusChange(newStatus);
    handleClose();
  };

  const handleDeleteClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    onDelete();
    handleClose();
  };

  const getCardHeaderStyles = (status: string) => {
    switch(status) {
      case 'Active': return { bgcolor: '#DCFCE7', color: '#166534', label: 'ACCEPTING APPLICATIONS' };
      case 'Draft': return { bgcolor: '#F1F5F9', color: '#475569', label: 'DRAFT' };
      case 'Closed': return { bgcolor: '#FEE2E2', color: '#991B1B', label: 'COMPLETED' };
      default: return { bgcolor: '#F1F5F9', color: '#475569', label: 'UNKNOWN' };
    }
  };

  const headerStyle = getCardHeaderStyles(post.status);

  return (
    <Card sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      minWidth: 320,
      minHeight: 280,
      borderRadius: 2,
      border: '1px solid #E2E8F0',
      boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)'
      }
    }}>
      {/* Top Colored Band */}
      <Box sx={{ 
        bgcolor: headerStyle.bgcolor, 
        px: 2, 
        py: 1.5, 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #E2E8F0',
        zIndex: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#475569' }}>
            Project
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: headerStyle.color, letterSpacing: '0.05em' }}>
            {headerStyle.label}
          </Typography>
        </Box>
        <IconButton size="small" onClick={handleClick} sx={{ color: '#475569' }}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem component={Link} href={`/dashboard/edit/${post.id}`} sx={{ fontWeight: 600, textDecoration: 'none', color: 'inherit' }}>Edit Project</MenuItem>
        <MenuItem onClick={(e) => handleMenuStatusChange(e, 'Draft')} selected={post.status === 'Draft'}>Set as Draft</MenuItem>
        <MenuItem onClick={(e) => handleMenuStatusChange(e, 'Active')} selected={post.status === 'Active'}>Set as Active</MenuItem>
        <MenuItem onClick={(e) => handleMenuStatusChange(e, 'Closed')} selected={post.status === 'Closed'}>Set as Completed</MenuItem>
        <MenuItem onClick={handleDeleteClick} sx={{ fontWeight: 600, color: 'error.main' }}>Delete Post</MenuItem>
      </Menu>

      <CardActionArea component={Link} href={`/dashboard/post/${post.id}`} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        {/* Main Content */}
        <CardContent sx={{ flexGrow: 1, p: 3, width: '100%' }}>
          <Typography variant="h5" sx={{ color: '#2563EB', fontWeight: 700, mb: 1 }}>
            {post.title}
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748B', mb: 3 }}>
            {post.status === 'Draft' ? 'Created' : post.status === 'Active' ? 'Listed' : 'Completed'} {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Typography>
          
          {post.content && (
            <Typography variant="body1" sx={{ color: '#334155', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {post.content}
            </Typography>
          )}
        </CardContent>
      </CardActionArea>

      <Divider />

      {/* Footer / Profile */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, bgcolor: '#F8FAFC' }}>
        <Avatar sx={{ bgcolor: '#E2E8F0', color: '#94A3B8' }}>
          <PersonIcon />
        </Avatar>
        <Box>
          <Typography variant="caption" sx={{ color: '#64748B', display: 'block' }}>
            Project posted by
          </Typography>
          <Typography variant="body2" sx={{ color: '#2563EB', fontWeight: 600 }}>
            {post.poster_name || userName}
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}
