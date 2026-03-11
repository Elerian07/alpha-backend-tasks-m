import { randomUUID } from 'crypto';

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuthUser } from '../auth/auth.types';
import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { SampleWorkspace } from '../entities/sample-workspace.entity';
import {
  SUMMARIZATION_PROVIDER,
  SummarizationProvider,
} from '../llm/summarization-provider.interface';
import { QueueService } from '../queue/queue.service';
import { CreateCandidateDocumentDto } from './dto/create-candidate-document.dto';

export const SUMMARY_JOB_NAME = 'candidate.summary.generate';

export interface SummaryJobPayload {
  summaryId: string;
  candidateId: string;
  workspaceId: string;
}

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    @InjectRepository(SampleWorkspace)
    private readonly workspaceRepo: Repository<SampleWorkspace>,
    @InjectRepository(SampleCandidate)
    private readonly candidateRepo: Repository<SampleCandidate>,
    @InjectRepository(CandidateDocument)
    private readonly documentRepo: Repository<CandidateDocument>,
    @InjectRepository(CandidateSummary)
    private readonly summaryRepo: Repository<CandidateSummary>,
    @Inject(SUMMARIZATION_PROVIDER)
    private readonly summarizationProvider: SummarizationProvider,
    private readonly queueService: QueueService,
  ) {}

  async uploadDocument(
    user: AuthUser,
    candidateId: string,
    dto: CreateCandidateDocumentDto,
  ): Promise<CandidateDocument> {
    await this.getCandidateOrThrow(candidateId, user.workspaceId);

    const doc = this.documentRepo.create({
      id: randomUUID(),
      candidateId,
      workspaceId: user.workspaceId,
      documentType: dto.documentType,
      fileName: dto.fileName.trim(),
      storageKey: `uploads/${user.workspaceId}/${candidateId}/${randomUUID()}-${dto.fileName.trim()}`,
      rawText: dto.rawText,
    });

    return this.documentRepo.save(doc);
  }

  async requestSummary(
    user: AuthUser,
    candidateId: string,
  ): Promise<{ summaryId: string; status: string; message: string }> {
    await this.getCandidateOrThrow(candidateId, user.workspaceId);

    const summary = this.summaryRepo.create({
      id: randomUUID(),
      candidateId,
      workspaceId: user.workspaceId,
      status: 'pending',
    });

    await this.summaryRepo.save(summary);

    const payload: SummaryJobPayload = {
      summaryId: summary.id,
      candidateId,
      workspaceId: user.workspaceId,
    };

    const job = this.queueService.enqueue<SummaryJobPayload>(SUMMARY_JOB_NAME, payload);
    this.logger.log(`Enqueued summary job ${job.id} for candidate ${candidateId}`);

    this.processSummaryJob(payload).catch((err) =>
      this.logger.error(`Summary job failed: ${err?.message}`, err),
    );

    return {
      summaryId: summary.id,
      status: 'pending',
      message: 'Summary generation has been queued',
    };
  }

  async listSummaries(user: AuthUser, candidateId: string): Promise<CandidateSummary[]> {
    await this.getCandidateOrThrow(candidateId, user.workspaceId);

    return this.summaryRepo.find({
      where: { candidateId, workspaceId: user.workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async getSummary(
    user: AuthUser,
    candidateId: string,
    summaryId: string,
  ): Promise<CandidateSummary> {
    await this.getCandidateOrThrow(candidateId, user.workspaceId);

    const summary = await this.summaryRepo.findOne({
      where: { id: summaryId, candidateId, workspaceId: user.workspaceId },
    });

    if (!summary) {
      throw new NotFoundException('Summary not found');
    }

    return summary;
  }

  async processSummaryJob(payload: SummaryJobPayload): Promise<void> {
    const { summaryId, candidateId, workspaceId } = payload;

    const summary = await this.summaryRepo.findOne({ where: { id: summaryId } });
    if (!summary) return;

    try {
      const documents = await this.documentRepo.find({
        where: { candidateId, workspaceId },
      });

      const result = await this.summarizationProvider.generateCandidateSummary({
        candidateId,
        documents: documents.map((d) => d.rawText),
      });

      await this.summaryRepo.update(summaryId, {
        status: 'completed',
        score: result.score,
        strengths: result.strengths,
        concerns: result.concerns,
        summary: result.summary,
        recommendedDecision: result.recommendedDecision,
        provider: 'gemini/gemini-1.5-flash',
        promptVersion: '1.0.0',
        errorMessage: null,
      });

      this.logger.log(`Summary ${summaryId} completed`);
    } catch (err: any) {
      await this.summaryRepo.update(summaryId, {
        status: 'failed',
        errorMessage: err?.message ?? 'Unknown error',
      });

      this.logger.error(`Summary ${summaryId} failed: ${err?.message}`);
    }
  }

  private async getCandidateOrThrow(
    candidateId: string,
    workspaceId: string,
  ): Promise<SampleCandidate> {
    const candidate = await this.candidateRepo.findOne({
      where: { id: candidateId, workspaceId },
    });

    if (!candidate) {
      throw new NotFoundException(
        'Candidate not found or does not belong to your workspace',
      );
    }

    return candidate;
  }
}