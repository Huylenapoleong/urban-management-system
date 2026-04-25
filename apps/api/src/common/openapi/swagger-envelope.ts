import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type {
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ResponseMetaDto } from './swagger.models';

interface EnvelopeOptions {
  description?: string;
  isArray?: boolean;
}

function buildEnvelopeSchema(
  model: Type<unknown>,
  isArray = false,
): SchemaObject {
  const properties: Record<string, SchemaObject | ReferenceObject> = {
    success: {
      type: 'boolean',
      example: true,
    },
    data: isArray
      ? {
          type: 'array',
          items: {
            $ref: getSchemaPath(model),
          },
        }
      : {
          $ref: getSchemaPath(model),
        },
  };
  const required = ['success', 'data'];

  if (isArray) {
    properties.meta = {
      $ref: getSchemaPath(ResponseMetaDto),
    };
    required.push('meta');
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

export function ApiOkEnvelopeResponse(
  model: Type<unknown>,
  options: EnvelopeOptions = {},
) {
  const extraModels = options.isArray ? [model, ResponseMetaDto] : [model];

  return applyDecorators(
    ApiExtraModels(...extraModels),
    ApiOkResponse({
      description: options.description,
      schema: buildEnvelopeSchema(model, options.isArray),
    }),
  );
}

export function ApiCreatedEnvelopeResponse(
  model: Type<unknown>,
  options: EnvelopeOptions = {},
) {
  const extraModels = options.isArray ? [model, ResponseMetaDto] : [model];

  return applyDecorators(
    ApiExtraModels(...extraModels),
    ApiCreatedResponse({
      description: options.description,
      schema: buildEnvelopeSchema(model, options.isArray),
    }),
  );
}
