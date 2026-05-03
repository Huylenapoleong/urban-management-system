import 'package:flutter/material.dart';

class DynamicFormBuilder extends StatefulWidget {
  const DynamicFormBuilder({
    super.key,
    required this.schema,
    required this.onSubmit,
  });

  final List<dynamic> schema;
  final void Function(Map<String, dynamic> data) onSubmit;

  @override
  State<DynamicFormBuilder> createState() => _DynamicFormBuilderState();
}

class _DynamicFormBuilderState extends State<DynamicFormBuilder> {
  final Map<String, dynamic> _formData = {};

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ...widget.schema.map((field) {
          final type = field['type'];
          final name = field['name'];
          final label = field['label'] ?? name;

          if (type == 'text') {
            return Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: TextFormField(
                decoration: InputDecoration(labelText: label),
                onChanged: (val) => _formData[name] = val,
              ),
            );
          } else if (type == 'dropdown') {
            final options = field['options'] as List<dynamic>? ?? [];
            return Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: DropdownButtonFormField<String>(
                decoration: InputDecoration(labelText: label),
                items: options.map((opt) {
                  return DropdownMenuItem<String>(
                    value: opt.toString(),
                    child: Text(opt.toString()),
                  );
                }).toList(),
                onChanged: (val) => _formData[name] = val,
              ),
            );
          } else if (type == 'checkbox') {
            return CheckboxListTile(
              title: Text(label),
              value: _formData[name] == true,
              onChanged: (val) {
                setState(() => _formData[name] = val);
              },
            );
          }
          return const SizedBox.shrink();
        }),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => widget.onSubmit(_formData),
          child: const Text('Gửi phản ánh'),
        ),
      ],
    );
  }
}
