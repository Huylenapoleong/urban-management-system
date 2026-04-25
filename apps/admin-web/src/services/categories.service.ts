import { ApiResponse, ListResponse } from './api-client';

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string;
}

// Mock store — replace with real API calls when backend is ready
let mockCategories: Category[] = [
  {
    id: 'cat-1',
    name: 'Infrastructure',
    description: 'Roads, bridges, public works',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-2',
    name: 'Traffic',
    description: 'Traffic jams, accidents, signals',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-3',
    name: 'Public Services',
    description: 'Garbage, water supply, electricity',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-4',
    name: 'Environment',
    description: 'Pollution, flooding, green spaces',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-5',
    name: 'Security',
    description: 'Crime, vandalism, public safety',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-6',
    name: 'Public Order',
    description: 'Noise, illegal construction',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

class CategoriesService {
  async getCategories(): Promise<ApiResponse<ListResponse<Category>>> {
    return {
      success: true,
      data: {
        items: [...mockCategories],
        total: mockCategories.length,
        page: 1,
        limit: 100,
        totalPages: 1,
      },
    };
  }

  async getCategoryById(id: string): Promise<ApiResponse<Category>> {
    const cat = mockCategories.find((c) => c.id === id);
    if (!cat) return { success: false, error: 'Category not found' };
    return { success: true, data: cat };
  }

  async createCategory(
    data: CreateCategoryRequest,
  ): Promise<ApiResponse<Category>> {
    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: data.name,
      description: data.description,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockCategories.push(newCat);
    return { success: true, data: newCat };
  }

  async updateCategory(
    id: string,
    data: UpdateCategoryRequest,
  ): Promise<ApiResponse<Category>> {
    const idx = mockCategories.findIndex((c) => c.id === id);
    if (idx === -1) return { success: false, error: 'Category not found' };
    mockCategories[idx] = {
      ...mockCategories[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    return { success: true, data: mockCategories[idx] };
  }

  async deleteCategory(id: string): Promise<ApiResponse<void>> {
    mockCategories = mockCategories.filter((c) => c.id !== id);
    return { success: true };
  }
}

export const categoriesService = new CategoriesService();
