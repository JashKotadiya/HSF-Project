'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

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
      // Simulate API call
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
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Paper elevation={0} sx={{ border: '1px solid #E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
        
        {/* Header */}
        <Box sx={{ p: 4, bgcolor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
          <Typography sx={{ fontWeight: 700, color: 'text.secondary' }} variant="overline">
            Application Questions
          </Typography>
          <Typography sx={{ fontWeight: 700, color: '#0F172A', mt: 1 }} variant="h5">
            Submit your Application
          </Typography>
          <Typography variant="body2" sx={{ color: '#475569', mt: 1, maxWidth: '600px' }}>
            Please fill out the short answer questions below and upload your most recent resume to apply for this position.
          </Typography>
        </Box>

        {/* Form Fields */}
        <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {questions.map((question, index) => (
            <Box key={index}>
              <Typography sx={{ fontWeight: 600, color: '#0F172A', mb: 1.5 }} variant="subtitle1">
                {question}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={4}
                value={answers[index]}
                onChange={(e) => handleAnswerChange(index, e.target.value)}
                placeholder="Type your response here..."
                variant="outlined"
              />
            </Box>
          ))}

          <Divider />

          {/* Resume Upload */}
          <Box>
            <Typography sx={{ fontWeight: 600, color: '#0F172A', mb: 1.5 }} variant="subtitle1">
              Upload Resume
            </Typography>
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3, 
                bgcolor: '#F8FAFC', 
                border: '1px solid #CBD5E1', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 2
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 600, color: '#0F172A' }} variant="body2">
                  {resume ? resume.name : "No file selected"}
                </Typography>
                <Typography sx={{ color: 'text.secondary' }} variant="caption">
                  Accepted formats: PDF, DOC, DOCX
                </Typography>
              </Box>
              
              <Button
                component="label"
                variant="outlined"
                startIcon={<CloudUploadIcon />}
                sx={{ textTransform: 'none' }}
              >
                Choose File
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
            </Paper>
          </Box>
        </Box>
      </Paper>

      {/* Error/Success Messages */}
      {errors.length > 0 && (
        <Alert severity="error">
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success">{successMessage}</Alert>
      )}

      {/* Submit Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button 
          type="submit" 
          variant="contained" 
          color="primary" 
          size="large"
          disabled={isSubmitting}
          sx={{ px: 4, py: 1.5, borderRadius: 2, textTransform: 'none', fontSize: '1rem' }}
        >
          {isSubmitting ? "Submitting..." : "Submit Application"}
        </Button>
      </Box>
    </Box>
  );
}
