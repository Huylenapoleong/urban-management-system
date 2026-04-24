/**
 * AI Chatbot Configuration Page
 * Admin can configure AI chatbot settings and manage FAQ
 */

import React, { useState } from 'react';
import ComponentCard from '../../components/common/ComponentCard';
import PageBreadCrumb from '../../components/common/PageBreadCrumb';
import PageMeta from '../../components/common/PageMeta';
import { useI18n } from '../../i18n/i18n-context';

interface FAQ {
  id: number;
  question: string;
  answer: string;
}

const ChatbotSettings: React.FC = () => {
  const { t } = useI18n();
  const [apiKey, setApiKey] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(
    'You are a support assistant for the smart city issue management system...',
  );
  const [faqs, setFaqs] = useState<FAQ[]>([
    {
      id: 1,
      question: 'How do I report an issue?',
      answer:
        "Click on the 'Report' button and fill out the form with issue details...",
    },
  ]);

  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });
  const [savingConfig, setSavingConfig] = useState(false);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      // In a real app, you would send this to an API service
      console.log('Saving chatbot config:', { apiKey, systemPrompt });
      alert(t('chatbot.saveSuccess'));
    } catch {
      alert(t('chatbot.saveError'));
    } finally {
      setSavingConfig(false);
    }
  };

  const addFaq = () => {
    if (newFaq.question && newFaq.answer) {
      setFaqs([...faqs, { id: faqs.length + 1, ...newFaq }]);
      setNewFaq({ question: '', answer: '' });
    }
  };

  const deleteFaq = (id: number) => {
    setFaqs(faqs.filter((faq) => faq.id !== id));
  };

  return (
    <>
      <PageMeta
        title={t('chatbot.title')}
        description={t('chatbot.description')}
      />
      <PageBreadCrumb pageTitle={t('chatbot.title')} />

      <div className="grid gap-4 md:grid-cols-2">
        <ComponentCard title={t('chatbot.apiConfiguration')}>
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-gray-700">
              {t('chatbot.apiKey')}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-2 text-gray-700">
              {t('chatbot.systemPrompt')}
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors duration-200 font-medium shadow-md"
          >
            {savingConfig ? t('common.loading') : t('chatbot.save')}
          </button>
        </ComponentCard>

        <ComponentCard title={t('chatbot.faqManagement')}>
          <div className="mb-6">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-700">
                {t('chatbot.question')}
              </label>
              <input
                type="text"
                placeholder={t('chatbot.faqQuestion')}
                value={newFaq.question}
                onChange={(e) =>
                  setNewFaq({ ...newFaq, question: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-700">
                {t('chatbot.answer')}
              </label>
              <textarea
                placeholder={t('chatbot.faqAnswer')}
                value={newFaq.answer}
                onChange={(e) =>
                  setNewFaq({ ...newFaq, answer: e.target.value })
                }
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              onClick={addFaq}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200 font-medium shadow-md"
            >
              + {t('chatbot.addFaq')}
            </button>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {faqs.map((faq) => (
              <div
                key={faq.id}
                className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <p className="font-medium text-sm text-gray-900">
                    {faq.question}
                  </p>
                  <button
                    onClick={() => deleteFaq(faq.id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    {t('common.delete')}
                  </button>
                </div>
                <p className="text-sm text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </ComponentCard>
      </div>
    </>
  );
};

export default ChatbotSettings;
