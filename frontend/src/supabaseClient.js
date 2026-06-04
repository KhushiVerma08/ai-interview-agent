import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ppenztmwjgwtuafwesvg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZW56dG13amd3dHVhZndlc3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNzkwNDAsImV4cCI6MjA5NTk1NTA0MH0.Oo38lPYlSDokBWOJSM3DTgNjP0kvs7HIhU2lypC0Sak';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
