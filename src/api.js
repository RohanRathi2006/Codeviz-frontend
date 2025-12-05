import axios from 'axios';
const API_URL = 'http://127.0.0.1:8000';

export const analyzeRepo = async (repoUrl) => { /* keep existing */
  const response = await axios.post(`${API_URL}/visualize`, { url: repoUrl });
  return response.data;
};

export const getFileContent = async (filePath) => { /* keep existing */
  const response = await axios.post(`${API_URL}/content`, { path: filePath, url: "dummy" });
  return response.data.code;
};

// NEW FUNCTION
export const explainCode = async (codeSnippet) => {
  try {
    const response = await axios.post(`${API_URL}/explain`, { code: codeSnippet });
    return response.data.explanation;
  } catch (error) {
    return "Failed to get explanation.";
  }
};