import { GoogleGenAI } from '@google/genai';
import { Embedding, EmbeddingVector } from './base-embedding';

export interface VertexAIEmbeddingConfig {
    model: string;
    /** Optional explicit Vertex AI project ID. Falls back to VERTEX_PROJECT or GOOGLE_CLOUD_PROJECT env vars. */
    projectId?: string;
    /** Optional explicit Vertex AI location (for example, "global" or "us-central1"). */
    location?: string;
    /** Optional output embedding dimensionality (Matryoshka-style dimensions). */
    outputDimensionality?: number;
}

export class VertexAIEmbedding extends Embedding {
    private client: GoogleGenAI;
    private config: VertexAIEmbeddingConfig;
    private dimension: number = 3072; // Default dimension for gemini-embedding-001
    protected maxTokens: number = 2048; // Maximum tokens for Gemini embedding models on Vertex AI

    constructor(config: VertexAIEmbeddingConfig) {
        super();
        this.config = config;

        const projectId =
            config.projectId ||
            process.env.VERTEX_PROJECT ||
            process.env.GOOGLE_CLOUD_PROJECT;

        const location =
            config.location ||
            process.env.VERTEX_LOCATION ||
            process.env.GOOGLE_CLOUD_LOCATION ||
            'global';

        if (!projectId) {
            throw new Error(
                '[VertexAIEmbedding] Project ID is required. Set projectId in config or VERTEX_PROJECT / GOOGLE_CLOUD_PROJECT env.'
            );
        }

        // Configure Google GenAI client to use Vertex AI backend
        this.client = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location,
        });

        // Set dimension based on model and configuration
        this.updateDimensionForModel(config.model || 'gemini-embedding-001');

        // Override dimension if specified in config
        if (config.outputDimensionality) {
            this.dimension = config.outputDimensionality;
        }
    }

    private updateDimensionForModel(model: string): void {
        const supportedModels = VertexAIEmbedding.getSupportedModels();
        const modelInfo = supportedModels[model];

        if (modelInfo) {
            this.dimension = modelInfo.dimension;
            this.maxTokens = modelInfo.contextLength;
        } else {
            // Use default dimension and context length for unknown models
            this.dimension = 3072;
            this.maxTokens = 2048;
        }
    }

    async detectDimension(): Promise<number> {
        // Vertex AI doesn't need dynamic detection, return configured dimension
        return this.dimension;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        const model = this.config.model || 'gemini-embedding-001';

        try {
            const response = await this.client.models.embedContent({
                model,
                contents: processedText,
                config: {
                    outputDimensionality: this.config.outputDimensionality || this.dimension,
                },
            });

            if (!response.embeddings || !response.embeddings[0] || !response.embeddings[0].values) {
                throw new Error('Vertex AI embedding API returned invalid response');
            }

            return {
                vector: response.embeddings[0].values,
                dimension: response.embeddings[0].values.length,
            };
        } catch (error) {
            throw new Error(
                `Vertex AI embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        const model = this.config.model || 'gemini-embedding-001';

        try {
            const response = await this.client.models.embedContent({
                model,
                contents: processedTexts,
                config: {
                    outputDimensionality: this.config.outputDimensionality || this.dimension,
                },
            });

            if (!response.embeddings) {
                throw new Error('Vertex AI embedding API returned invalid response');
            }

            return response.embeddings.map((embedding: any) => {
                if (!embedding.values) {
                    throw new Error('Vertex AI embedding API returned invalid embedding data');
                }
                return {
                    vector: embedding.values,
                    dimension: embedding.values.length,
                };
            });
        } catch (error) {
            throw new Error(
                `Vertex AI batch embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    getDimension(): number {
        return this.dimension;
    }

    getProvider(): string {
        return 'VertexAI';
    }

    /**
     * Get list of supported models when using Vertex AI embeddings.
     */
    static getSupportedModels(): Record<
        string,
        { dimension: number; contextLength: number; description: string; supportedDimensions?: number[] }
    > {
        return {
            'gemini-embedding-001': {
                dimension: 3072,
                contextLength: 2048,
                description: 'Gemini text embedding model served via Vertex AI (recommended)',
                // Matryoshka Representation Learning supported dimensions
                supportedDimensions: [3072, 1536, 768, 256],
            },
        };
    }

    /**
     * Get supported dimensions for the current model
     */
    getSupportedDimensions(): number[] {
        const modelInfo =
            VertexAIEmbedding.getSupportedModels()[this.config.model || 'gemini-embedding-001'];
        return modelInfo?.supportedDimensions || [this.dimension];
    }

    /**
     * Validate if a dimension is supported by the current model
     */
    isDimensionSupported(dimension: number): boolean {
        const supportedDimensions = this.getSupportedDimensions();
        return supportedDimensions.includes(dimension);
    }
}
