import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('TalentFlow API')
    .setDescription('Candidate Document Intake + Summary Workflow')
    .setVersion('0.1.0')
    .addGlobalParameters(
      {
        name: 'x-user-id',
        in: 'header',
        required: true,
        schema: { type: 'string', default: 'user-1' },
      },
      {
        name: 'x-workspace-id',
        in: 'header',
        required: true,
        schema: { type: 'string', default: 'ws-1' },
      },
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

bootstrap();