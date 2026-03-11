import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { DocumentType } from '../../entities/candidate-document.entity';

export class CreateCandidateDocumentDto {
  @ApiProperty({
    enum: ['resume', 'cover_letter', 'other'],
    example: 'resume',
    description: 'Type of the document being uploaded',
  })
  @IsEnum(['resume', 'cover_letter', 'other'])
  documentType!: DocumentType;

  @ApiProperty({
    example: 'cv.pdf',
    description: 'Original file name',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({
    example: 'Experienced backend engineer with expertise in Node.js and PostgreSQL.',
    description: 'Extracted plain text content of the document',
  })
  @IsString()
  @IsNotEmpty()
  rawText!: string;
}