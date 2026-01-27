/**
 * Resume Parser Service
 *
 * Downloads and parses resume PDFs to extract structured work history.
 * Uses Claude's native PDF understanding for accurate extraction.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AshbyClient } from "../client.js";
import type { Candidate, ApplicationWithContext } from "../../types/index.js";
import { logger } from "../../utils/logger.js";

/**
 * Structured work experience entry
 */
export interface WorkExperience {
  company: string;
  title: string;
  startDate: string;
  endDate: string | null; // null = "Present"
  duration: string;
  highlights?: string[];
}

/**
 * Structured education entry
 */
export interface Education {
  institution: string;
  degree: string;
  field?: string;
  graduationDate?: string;
}

/**
 * Parsed resume data
 */
export interface ParsedResume {
  summary: string;
  totalYearsExperience: string;
  experience: WorkExperience[];
  education: Education[];
  skills: string[];
  linkedIn?: string;
  website?: string;
}

/**
 * Expanded candidate background profile
 */
export interface CandidateBackground {
  candidate: {
    name: string;
    email?: string;
    profileUrl?: string;
  };
  currentApplication?: {
    job: string;
    stage: string;
    daysInStage: number;
    status: string;
  };
  parsedResume: ParsedResume;
  links: {
    linkedIn?: string;
    website?: string;
    resumeUrl?: string;
  };
  notes: Array<{ content: string; createdAt: string }>;
}

const RESUME_PARSE_PROMPT = `Analyze this resume and extract the following information in JSON format:

{
  "summary": "2-3 sentence professional summary highlighting key expertise and experience level",
  "totalYearsExperience": "X years (calculate from work history)",
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "startDate": "Month Year (e.g., Jan 2020)",
      "endDate": "Month Year or null if current",
      "duration": "X years Y months",
      "highlights": ["Key achievement 1", "Key achievement 2"]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "Degree Type (e.g., BS, MS, PhD)",
      "field": "Field of Study",
      "graduationDate": "Year"
    }
  ],
  "skills": ["Skill 1", "Skill 2", "Skill 3"],
  "linkedIn": "LinkedIn URL if present",
  "website": "Personal website if present"
}

RULES:
- List experience in reverse chronological order (most recent first)
- Calculate duration accurately based on dates provided
- For current roles, use null for endDate
- Extract 2-3 key highlights per role when available
- Keep skills list to top 10-15 most relevant
- If information is missing, use empty arrays or omit optional fields

PRIVACY - DO NOT EXTRACT:
- Social Security Numbers, national ID numbers, or tax IDs
- Full home addresses (city/country for location is fine)
- Date of birth or age
- Salary history or compensation expectations
- References or their contact information
- Marital status, number of dependents, or personal family info

EDGE CASES:
- If the document is a scanned image with no extractable text, return: {"summary": "Unable to parse - document appears to be a scanned image", "totalYearsExperience": "Unknown", "experience": [], "education": [], "skills": []}
- If the resume is in a non-English language, do your best to extract and translate key information to English
- If dates are ambiguous or missing, make reasonable estimates and note uncertainty in the duration field (e.g., "~2 years")

Return ONLY valid JSON, no markdown or explanation.`;

export class ResumeParserService {
  private readonly anthropic: Anthropic;
  private readonly client: AshbyClient;

  constructor(client: AshbyClient, anthropicApiKey: string) {
    this.client = client;
    this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
  }

  /**
   * Download a PDF from URL and return as base64
   */
  private async downloadPdfAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
  }

  /**
   * Parse a resume PDF using Claude
   */
  async parseResume(resumeUrl: string): Promise<ParsedResume> {
    logger.info("Parsing resume", { url: resumeUrl.substring(0, 50) + "..." });

    try {
      const pdfBase64 = await this.downloadPdfAsBase64(resumeUrl);

      const response = await this.anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text: RESUME_PARSE_PROMPT,
              },
            ],
          },
        ],
      });

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }

      // Parse JSON response
      const parsed = JSON.parse(textBlock.text) as ParsedResume;
      logger.info("Resume parsed successfully", {
        experienceCount: parsed.experience.length,
        totalYears: parsed.totalYearsExperience,
      });

      return parsed;
    } catch (error) {
      logger.error("Failed to parse resume", { error });
      throw new Error(`Resume parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Get full candidate background with parsed resume
   */
  async getCandidateBackground(
    candidate: Candidate,
    applications: ApplicationWithContext[],
    notes: Array<{ content: string; createdAt: string }>
  ): Promise<CandidateBackground> {
    // Get resume URL
    let resumeUrl: string | null = null;
    let parsedResume: ParsedResume;

    if (candidate.resumeFileHandle) {
      try {
        resumeUrl = await this.client.getFileUrl(candidate.resumeFileHandle);
        parsedResume = await this.parseResume(resumeUrl);
      } catch (error) {
        logger.warn("Failed to parse resume, using fallback", { error });
        parsedResume = this.createFallbackResume();
      }
    } else {
      logger.info("No resume on file for candidate", { candidateId: candidate.id });
      parsedResume = this.createFallbackResume();
    }

    // Find LinkedIn and website from social links
    const linkedIn = candidate.socialLinks?.find(
      (link) => link.type === "LinkedIn" || link.url?.includes("linkedin.com")
    )?.url;
    const website = candidate.socialLinks?.find(
      (link) => link.type === "Website" || link.type === "Portfolio"
    )?.url;

    // Get current application info
    const activeApp = applications.find((app) => app.status === "Active") ?? applications[0];

    // Build candidate info object - only include defined properties
    const candidateInfo: CandidateBackground["candidate"] = {
      name: candidate.name,
    };
    if (candidate.primaryEmailAddress?.value) {
      candidateInfo.email = candidate.primaryEmailAddress.value;
    }
    if (candidate.profileUrl) {
      candidateInfo.profileUrl = candidate.profileUrl;
    }

    // Build links object - only include defined properties
    const links: CandidateBackground["links"] = {};
    const finalLinkedIn = linkedIn ?? parsedResume.linkedIn;
    const finalWebsite = website ?? parsedResume.website;
    if (finalLinkedIn) {
      links.linkedIn = finalLinkedIn;
    }
    if (finalWebsite) {
      links.website = finalWebsite;
    }
    if (resumeUrl) {
      links.resumeUrl = resumeUrl;
    }

    const result: CandidateBackground = {
      candidate: candidateInfo,
      parsedResume,
      links,
      notes,
    };

    if (activeApp) {
      result.currentApplication = {
        job: activeApp.job?.title ?? "Unknown",
        stage: activeApp.currentInterviewStage?.title ?? "Unknown",
        daysInStage: activeApp.daysInCurrentStage ?? 0,
        status: activeApp.status,
      };
    }

    return result;
  }

  /**
   * Create a fallback resume structure when parsing fails or no resume exists
   */
  private createFallbackResume(): ParsedResume {
    return {
      summary: "Resume not available or could not be parsed.",
      totalYearsExperience: "Unknown",
      experience: [],
      education: [],
      skills: [],
    };
  }
}
