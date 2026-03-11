import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AuthUser } from '../auth/auth.types';
import { CandidateDocument } from '../entities/candidate-document.entity';
import { CandidateSummary } from '../entities/candidate-summary.entity';
import { SampleCandidate } from '../entities/sample-candidate.entity';
import { SampleWorkspace } from '../entities/sample-workspace.entity';
import { FakeSummarizationProvider } from '../llm/fake-summarization.provider';
import { SUMMARIZATION_PROVIDER } from '../llm/summarization-provider.interface';
import { QueueService } from '../queue/queue.service';
import { CandidatesService } from './candidates.service';

const mockUser: AuthUser = { userId: 'user-1', workspaceId: 'ws-1' };

const mockCandidate: SampleCandidate = {
  id: 'cand-1',
  workspaceId: 'ws-1',
  fullName: 'John Doe',
  email: 'john@example.com',
  createdAt: new Date(),
  workspace: {} as any,
};

function makeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    ...overrides,
  };
}

describe('CandidatesService', () => {
  let service: CandidatesService;
  let candidateRepo: ReturnType<typeof makeRepo>;
  let documentRepo: ReturnType<typeof makeRepo>;
  let summaryRepo: ReturnType<typeof makeRepo>;
  let queueService: { enqueue: jest.Mock };
  let provider: FakeSummarizationProvider;

  beforeEach(async () => {
    candidateRepo = makeRepo();
    documentRepo = makeRepo();
    summaryRepo = makeRepo();
    queueService = { enqueue: jest.fn().mockReturnValue({ id: 'job-1', name: 'test', payload: {}, enqueuedAt: '' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        FakeSummarizationProvider,
        { provide: getRepositoryToken(SampleWorkspace), useValue: makeRepo() },
        { provide: getRepositoryToken(SampleCandidate), useValue: candidateRepo },
        { provide: getRepositoryToken(CandidateDocument), useValue: documentRepo },
        { provide: getRepositoryToken(CandidateSummary), useValue: summaryRepo },
        { provide: SUMMARIZATION_PROVIDER, useClass: FakeSummarizationProvider },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get<CandidatesService>(CandidatesService);
    provider = module.get<FakeSummarizationProvider>(FakeSummarizationProvider);
  });

  describe('uploadDocument', () => {
    it('should upload document successfully', async () => {
      candidateRepo.findOne.mockResolvedValue(mockCandidate);
      const doc = { id: 'doc-1', candidateId: 'cand-1' };
      documentRepo.create.mockReturnValue(doc);
      documentRepo.save.mockResolvedValue(doc);

      const result = await service.uploadDocument(mockUser, 'cand-1', {
        documentType: 'resume',
        fileName: 'cv.pdf',
        rawText: 'Some resume text',
      });

      expect(result).toEqual(doc);
      expect(documentRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if candidate not found', async () => {
      candidateRepo.findOne.mockResolvedValue(null);

      await expect(
        service.uploadDocument(mockUser, 'wrong-id', {
          documentType: 'resume',
          fileName: 'cv.pdf',
          rawText: 'text',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if candidate belongs to different workspace', async () => {
      candidateRepo.findOne.mockResolvedValue(null);
      const otherUser: AuthUser = { userId: 'user-2', workspaceId: 'ws-999' };

      await expect(
        service.uploadDocument(otherUser, 'cand-1', {
          documentType: 'resume',
          fileName: 'cv.pdf',
          rawText: 'text',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('requestSummary', () => {
    it('should create pending summary and enqueue job', async () => {
      candidateRepo.findOne.mockResolvedValue(mockCandidate);
      const summary = { id: 'sum-1', status: 'pending' };
      summaryRepo.create.mockReturnValue(summary);
      summaryRepo.save.mockResolvedValue(summary);
      summaryRepo.findOne.mockResolvedValue(summary);
      documentRepo.find.mockResolvedValue([]);
      summaryRepo.update.mockResolvedValue({});

      const result = await service.requestSummary(mockUser, 'cand-1');

      expect(result.status).toBe('pending');
      expect(queueService.enqueue).toHaveBeenCalled();
    });

    it('should throw NotFoundException for unknown candidate', async () => {
      candidateRepo.findOne.mockResolvedValue(null);

      await expect(service.requestSummary(mockUser, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listSummaries', () => {
    it('should return summaries for candidate', async () => {
      candidateRepo.findOne.mockResolvedValue(mockCandidate);
      summaryRepo.find.mockResolvedValue([{ id: 'sum-1' }]);

      const result = await service.listSummaries(mockUser, 'cand-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getSummary', () => {
    it('should return summary by id', async () => {
      candidateRepo.findOne.mockResolvedValue(mockCandidate);
      summaryRepo.findOne.mockResolvedValue({ id: 'sum-1', status: 'completed' });

      const result = await service.getSummary(mockUser, 'cand-1', 'sum-1');
      expect(result.id).toBe('sum-1');
    });

    it('should throw NotFoundException if summary not found', async () => {
      candidateRepo.findOne.mockResolvedValue(mockCandidate);
      summaryRepo.findOne.mockResolvedValue(null);

      await expect(service.getSummary(mockUser, 'cand-1', 'bad-sum')).rejects.toThrow(NotFoundException);
    });
  });

  describe('processSummaryJob', () => {
    it('should complete summary with provider result', async () => {
      const summary = { id: 'sum-1', status: 'pending' };
      summaryRepo.findOne.mockResolvedValue(summary);
      documentRepo.find.mockResolvedValue([{ rawText: 'resume content' }]);
      summaryRepo.update.mockResolvedValue({});

      await service.processSummaryJob({ summaryId: 'sum-1', candidateId: 'cand-1', workspaceId: 'ws-1' });

      expect(summaryRepo.update).toHaveBeenCalledWith(
        'sum-1',
        expect.objectContaining({ status: 'completed' }),
      );
    });

 it('should mark summary as failed if provider throws', async () => {
  summaryRepo.findOne.mockResolvedValue({ id: 'sum-1' });
  documentRepo.find.mockResolvedValue([]);

  const mockProvider = {
    generateCandidateSummary: jest.fn().mockRejectedValue(new Error('LLM error')),
  };

  (service as any).summarizationProvider = mockProvider;

  summaryRepo.update.mockResolvedValue({});

  await service.processSummaryJob({ summaryId: 'sum-1', candidateId: 'cand-1', workspaceId: 'ws-1' });

  expect(summaryRepo.update).toHaveBeenCalledWith(
    'sum-1',
    expect.objectContaining({ status: 'failed' }),
  );
});
  });
});